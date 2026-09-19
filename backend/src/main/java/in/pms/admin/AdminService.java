package in.pms.admin;

import in.pms.audit.AuditService;
import in.pms.auth.CurrentUser;
import in.pms.auth.OtpService;
import in.pms.auth.PasswordService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Our own back office: onboard a property, see whether it is being used, and handle billing.
 *
 * <p>This is the one place that reaches across tenants, so two rules are absolute. It never returns guest
 * data: only counts and timestamps, which are enough to tell a healthy property from a stalled one. And
 * reading anything about a property is written to that property's own audit log, so the owner can see when
 * we looked and why. Support access to guest data is granted by the owner in their settings, time-boxed,
 * and is checked by {@link #requireSupportAccess} rather than assumed.
 */
@Service
public class AdminService {
    private final JdbcClient admin;
    private final PasswordService passwords;
    private final AuditService audit;

    public AdminService(@Qualifier("adminJdbc") JdbcClient admin, PasswordService passwords, AuditService audit) {
        this.admin = admin; this.passwords = passwords; this.audit = audit;
    }

    public record PropertyHealth(
            UUID propertyId, String propertyName, String city,
            UUID orgId, String orgName, String plan, String billingStatus,
            boolean active, int rooms, int bookingsLast30Days, OffsetDateTime lastActivityAt,
            int openFolios, long outstandingPaise, int outboxPending, boolean supportAccess,
            String code, List<String> modules) {}

    /** Every property with enough numbers to spot one that has gone quiet. No guest data. */
    @Transactional(value = "adminTx", readOnly = true)
    public List<PropertyHealth> properties() {
        return admin.sql("""
                select p.id, p.name, p.city, p.active, o.id as org_id, o.name as org_name,
                       coalesce(o.plan_code, 'none') as plan, o.billing_status::text as billing_status,
                       (select count(*) from rooms r where r.property_id = p.id and r.active) as rooms,
                       (select count(*) from bookings b where b.property_id = p.id and b.created_at > now() - interval '30 days') as recent_bookings,
                       (select max(b.created_at) from bookings b where b.property_id = p.id) as last_activity,
                       (select count(*) from folios f where f.property_id = p.id and f.status = 'open') as open_folios,
                       (select coalesce(sum(f.total_paise + f.deposit_held_paise - f.paid_paise), 0) from folios f
                          where f.property_id = p.id and f.status = 'open') as outstanding,
                       (select count(*) from outbox ob where ob.property_id = p.id and ob.status = 'pending') as outbox_pending,
                       coalesce(p.settings->>'support_access_until', '') as support_until, p.code, p.modules
                from properties p join organisations o on o.id = p.org_id
                order by o.name, p.name""")
                .query((rs, i) -> new PropertyHealth(
                        rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"),
                        rs.getObject("org_id", UUID.class), rs.getString("org_name"), rs.getString("plan"),
                        rs.getString("billing_status"), rs.getBoolean("active"), rs.getInt("rooms"),
                        rs.getInt("recent_bookings"), rs.getObject("last_activity", OffsetDateTime.class),
                        rs.getInt("open_folios"), rs.getLong("outstanding"), rs.getInt("outbox_pending"),
                        supportAccessOpen(rs.getString("support_until")),
                        rs.getString("code"), List.of((String[]) rs.getArray("modules").getArray())))
                .list();
    }

    public record NewPropertyInput(String orgName, String propertyName, String city, String state, String phone,
                                   String ownerName, String ownerPhone, String ownerEmail, String planCode) {}
    /** {@code ownerPassword} is shown once and never stored in the clear; null when the owner already had one. */
    public record NewPropertyResult(UUID orgId, UUID propertyId, UUID ownerId, String ownerPhone, String code, String ownerPassword) {}

    /**
     * Onboard a property: organisation, property, first owner and their membership, in one transaction. The
     * property gets its code and starts with the basics only. The owner signs in with the code, their mobile number
     * and the first password returned here, which they change after signing in.
     */
    @Transactional("adminTx")
    public NewPropertyResult createProperty(NewPropertyInput in, CurrentUser actor) {
        if (blank(in.orgName()) || blank(in.propertyName()) || blank(in.ownerName())) throw new BadRequestException("Trust, property and owner names are required");
        String ownerPhone = OtpService.normalisePhone(in.ownerPhone());
        String plan = blank(in.planCode()) ? null : in.planCode();
        if (plan != null && admin.sql("select code from plans where code = ?").param(plan).query(String.class).list().isEmpty())
            throw new BadRequestException("Unknown plan " + plan);

        UUID orgId = admin.sql("insert into organisations(name, plan_code) values (?, ?) returning id")
                .params(in.orgName().trim(), plan).query(UUID.class).single();
        var property = admin.sql("""
                insert into properties(org_id, name, city, state, phone, modules) values (?, ?, ?, ?, ?, '{}') returning id, code""")
                .params(orgId, in.propertyName().trim(), nz(in.city()), nz(in.state()), nz(in.phone()))
                .query().singleRow();
        UUID propertyId = (UUID) property.get("id");

        var existing = admin.sql("select id, password_hash is not null as has_password from users where phone = ?").param(ownerPhone).query().listOfRows();
        UUID ownerId = existing.isEmpty()
                ? admin.sql("insert into users(name, phone, email) values (?, ?, ?) returning id")
                        .params(in.ownerName().trim(), ownerPhone, blank(in.ownerEmail()) ? null : in.ownerEmail().trim().toLowerCase())
                        .query(UUID.class).single()
                : (UUID) existing.getFirst().get("id");
        // Someone who already signs in somewhere keeps the password they have.
        String password = existing.isEmpty() || !Boolean.TRUE.equals(existing.getFirst().get("has_password")) ? passwords.generate() : null;
        if (password != null) admin.sql("update users set password_hash = ?, updated_at = now() where id = ?").params(passwords.hash(password), ownerId).update();
        admin.sql("""
                insert into property_users(property_id, user_id, role) values (?, ?, 'owner')
                on conflict (property_id, user_id) do update set role = 'owner', active = true""")
                .params(propertyId, ownerId).update();

        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "onboard", null,
                Map.of("org", in.orgName(), "property", in.propertyName(), "ownerPhone", mask(ownerPhone)), actor.id());
        return new NewPropertyResult(orgId, propertyId, ownerId, ownerPhone, (String) property.get("code"), password);
    }

    /** Switch the optional parts of the product on or off for one property; takes effect on everyone's next request. */
    @Transactional("adminTx")
    public void setModules(UUID propertyId, List<String> modules, CurrentUser actor) {
        var wanted = modules == null ? List.<String>of() : modules.stream().distinct().toList();
        var unknown = wanted.stream().filter(m -> !Permissions.MODULES.containsKey(m)).toList();
        if (!unknown.isEmpty()) throw new BadRequestException("Unknown module " + unknown.getFirst());
        int changed = admin.sql("update properties set modules = ?, updated_at = now() where id = ?")
                .params(wanted.toArray(String[]::new), propertyId).update();
        if (changed == 0) throw new NotFoundException("Property");
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "modules", null, Map.of("modules", wanted), actor.id());
    }

    /** Billing state drives the banner and the read-only cut-off; the property's data is never deleted. */
    @Transactional("adminTx")
    public void setBillingStatus(UUID orgId, String status, CurrentUser actor) {
        if (!List.of("trial", "active", "overdue", "readonly", "closed").contains(status))
            throw new BadRequestException("Unknown billing status");
        String before = admin.sql("select billing_status::text from organisations where id = ?").param(orgId).query(String.class)
                .optional().orElseThrow(() -> new NotFoundException("Organisation"));
        admin.sql("update organisations set billing_status = ?::billing_status, updated_at = now() where id = ?").params(status, orgId).update();
        audit.recordPlatform(null, "organisations", orgId.toString(), "billing_status",
                Map.of("status", before), Map.of("status", status), actor.id());
    }

    @Transactional("adminTx")
    public void setPlan(UUID orgId, String planCode, CurrentUser actor) {
        if (admin.sql("select code from plans where code = ?").param(planCode).query(String.class).list().isEmpty())
            throw new BadRequestException("Unknown plan " + planCode);
        admin.sql("update organisations set plan_code = ?, updated_at = now() where id = ?").params(planCode, orgId).update();
        audit.recordPlatform(null, "organisations", orgId.toString(), "plan", null, Map.of("plan", planCode), actor.id());
    }

    /**
     * Guest data is the property's, not ours. Support may read it only while the owner has left the window
     * open in their settings, and every such read is logged against that property.
     */
    // Not read-only: looking is itself recorded, which is the point.
    @Transactional("adminTx")
    public void requireSupportAccess(UUID propertyId, CurrentUser actor, String what) {
        String until = admin.sql("select coalesce(settings->>'support_access_until', '') from properties where id = ?")
                .param(propertyId).query(String.class).optional().orElseThrow(() -> new NotFoundException("Property"));
        if (!supportAccessOpen(until)) throw new ForbiddenException("The owner has not granted support access to this property");
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "support_read", null, Map.of("what", what), actor.id());
    }

    /** Recent platform activity for one property: what changed, by whom, without any guest detail. */
    // Not read-only: the admin's own read is written to the property's audit log first.
    @Transactional("adminTx")
    public List<Map<String, Object>> recentActivity(UUID propertyId, CurrentUser actor) {
        audit.recordPlatform(propertyId, "audit_log", propertyId.toString(), "admin_view", null, null, actor.id());
        return admin.sql("""
                select a.at, a.table_name, a.action, coalesce(u.name, 'system') as who
                from audit_log a left join users u on u.id = a.user_id
                where a.property_id = ? order by a.at desc limit 50""")
                .param(propertyId).query().listOfRows();
    }

    private static boolean supportAccessOpen(String until) {
        if (until == null || until.isBlank()) return false;
        try { return OffsetDateTime.parse(until).isAfter(OffsetDateTime.now()); } catch (Exception e) { return false; }
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }
    private static String nz(String s) { return s == null ? "" : s.trim(); }
    private static String mask(String phone) { return "******" + phone.substring(Math.max(0, phone.length() - 4)); }
}
