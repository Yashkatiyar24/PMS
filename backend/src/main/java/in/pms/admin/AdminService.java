package in.pms.admin;

import in.pms.audit.AuditService;
import in.pms.auth.CurrentUser;
import in.pms.auth.OtpService;
import in.pms.auth.PasswordService;
import in.pms.auth.Permissions;
import in.pms.auth.SessionService;
import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.integrations.storage.StorageProvider;
import in.pms.property.PropertyService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
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
    private final StorageProvider storage;
    private final SessionService sessions;

    public AdminService(@Qualifier("adminJdbc") JdbcClient admin, PasswordService passwords, AuditService audit, StorageProvider storage, SessionService sessions) {
        this.admin = admin; this.passwords = passwords; this.audit = audit; this.storage = storage; this.sessions = sessions;
    }

    public record PropertyHealth(
            UUID propertyId, String propertyName, String city, String state, String phone,
            UUID orgId, String orgName, String plan, String billingStatus,
            boolean active, int rooms, int users, int stayingNow, int bookingsLast30Days, OffsetDateTime lastActivityAt,
            int openFolios, long outstandingPaise, int outboxPending, boolean supportAccess,
            String code, List<String> modules, OffsetDateTime createdAt, String ownerName, String ownerPhone, String photoUrl, String notes) {}

    /** Someone who works at a property: a name and a role the owner gave us. Nothing about any guest. */
    public record Member(UUID userId, String name, String phone, String role, boolean active) {}
    /** A password the platform just set for someone, shown once; the desk signs in with their code, phone and this. */
    public record NewPassword(String name, String phone, String email, String password) {}
    public record Plan(String code, String name, int maxRooms, long monthlyPaise) {}

    /** One property's health in numbers. The first owner is the person to call about it. */
    private static final String HEALTH_SQL = """
            select p.id, p.name, p.city, p.state, p.phone, p.active, p.created_at, o.id as org_id, o.name as org_name,
                   coalesce(o.plan_code, 'none') as plan, o.billing_status::text as billing_status,
                   (select count(*) from rooms r where r.property_id = p.id and r.active) as rooms,
                   (select count(*) from property_users pu where pu.property_id = p.id and pu.active) as users,
                   (select count(*) from bookings b where b.property_id = p.id and b.state = 'checked_in') as staying_now,
                   (select count(*) from bookings b where b.property_id = p.id and b.created_at > now() - interval '30 days') as recent_bookings,
                   (select max(b.created_at) from bookings b where b.property_id = p.id) as last_activity,
                   (select count(*) from folios f where f.property_id = p.id and f.status = 'open') as open_folios,
                   (select coalesce(sum(f.total_paise + f.deposit_held_paise - f.paid_paise), 0) from folios f
                      where f.property_id = p.id and f.status = 'open') as outstanding,
                   (select count(*) from outbox ob where ob.property_id = p.id and ob.status = 'pending') as outbox_pending,
                   coalesce(p.settings->>'support_access_until', '') as support_until, p.code, p.modules, p.photo_key, p.platform_notes,
                   own.name as owner_name, own.phone as owner_phone
            from properties p
            join organisations o on o.id = p.org_id
            left join lateral (select u.name, u.phone from property_users pu join users u on u.id = pu.user_id
                               where pu.property_id = p.id and pu.role = 'owner' and pu.active
                               order by pu.created_at limit 1) own on true
            """;

    /** Every property with enough numbers to spot one that has gone quiet. No guest data. */
    @Transactional(value = "adminTx", readOnly = true)
    public List<PropertyHealth> properties() {
        return admin.sql(HEALTH_SQL + " order by o.name, p.name").query(this::health).list();
    }

    @Transactional(value = "adminTx", readOnly = true)
    public PropertyHealth property(UUID id) {
        return admin.sql(HEALTH_SQL + " where p.id = ?").param(id).query(this::health).optional()
                .orElseThrow(() -> new NotFoundException("Property"));
    }

    private PropertyHealth health(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new PropertyHealth(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"), rs.getString("state"), rs.getString("phone"),
                rs.getObject("org_id", UUID.class), rs.getString("org_name"), rs.getString("plan"),
                rs.getString("billing_status"), rs.getBoolean("active"), rs.getInt("rooms"), rs.getInt("users"), rs.getInt("staying_now"),
                rs.getInt("recent_bookings"), rs.getObject("last_activity", OffsetDateTime.class),
                rs.getInt("open_folios"), rs.getLong("outstanding"), rs.getInt("outbox_pending"),
                supportAccessOpen(rs.getString("support_until")),
                rs.getString("code"), List.of((String[]) rs.getArray("modules").getArray()),
                rs.getObject("created_at", OffsetDateTime.class), rs.getString("owner_name"), rs.getString("owner_phone"),
                PropertyService.photoUrl(storage, rs.getString("photo_key")), rs.getString("platform_notes"));
    }

    /**
     * Switch a property off or on. Off, its staff no longer find it among their properties and its booking page
     * answers "not available"; every row of its data stays exactly where it is.
     */
    @Transactional("adminTx")
    public PropertyHealth setActive(UUID propertyId, boolean active, CurrentUser actor) {
        int changed = admin.sql("update properties set active = ?, updated_at = now() where id = ?").params(active, propertyId).update();
        if (changed == 0) throw new NotFoundException("Property");
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "active", null, Map.of("active", active), actor.id());
        return property(propertyId);
    }

    /** The platform team's own notes on a property. Never shown to the property. */
    @Transactional("adminTx")
    public PropertyHealth setNotes(UUID propertyId, String notes, CurrentUser actor) {
        String clean = notes == null ? null : notes.strip();
        if (clean != null && clean.length() > 4000) throw new BadRequestException("Notes are limited to 4000 characters");
        if (clean != null && clean.isEmpty()) clean = null;
        int changed = admin.sql("update properties set platform_notes = ?, updated_at = now() where id = ?").params(clean, propertyId).update();
        if (changed == 0) throw new NotFoundException("Property");
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "notes", null, Map.of("length", clean == null ? 0 : clean.length()), actor.id());
        return property(propertyId);
    }

    /**
     * A new password for someone at a property, for the owner who rings up locked out. Only for a person who works
     * at that property, never for a platform admin, and logged against the property so the owner can see it happened.
     */
    @Transactional("adminTx")
    public NewPassword resetPassword(UUID propertyId, UUID userId, CurrentUser actor) {
        var row = admin.sql("""
                select u.name, u.phone, u.email, u.is_super_admin from users u join property_users pu on pu.user_id = u.id
                where pu.property_id = ? and u.id = ?""").params(propertyId, userId).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new NotFoundException("That person does not work at this property"));
        if (Boolean.TRUE.equals(row.get("is_super_admin"))) throw new ForbiddenException("A platform admin's password cannot be reset here");
        String password = passwords.generate();
        admin.sql("update users set password_hash = ?, must_change_password = true, updated_at = now() where id = ?").params(passwords.hash(password), userId).update();
        sessions.revokeAll(userId); // whoever held the old password, or a session opened with it, is out
        audit.recordPlatform(propertyId, "users", userId.toString(), "password_reset", null, null, actor.id());
        return new NewPassword((String) row.get("name"), (String) row.get("phone"), (String) row.get("email"), password);
    }

    /** The platform setting a property's photograph, e.g. at onboarding. The owner can change it from their own settings. */
    @Transactional("adminTx")
    public PropertyHealth storePhoto(UUID propertyId, InputStream data, long length, String contentType, CurrentUser actor) {
        String old = photoKey(propertyId);
        String key = PropertyService.photoKey(propertyId, length, contentType);
        storage.put(key, in.pms.files.Uploads.checked(data, contentType), length, contentType);
        admin.sql("update properties set photo_key = ?, updated_at = now() where id = ?").params(key, propertyId).update();
        if (old != null) storage.delete(old);
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "photo", null, Map.of("hasPhoto", true), actor.id());
        return property(propertyId);
    }

    @Transactional("adminTx")
    public PropertyHealth removePhoto(UUID propertyId, CurrentUser actor) {
        String old = photoKey(propertyId);
        admin.sql("update properties set photo_key = null, updated_at = now() where id = ?").param(propertyId).update();
        if (old != null) storage.delete(old);
        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "photo", null, Map.of("hasPhoto", false), actor.id());
        return property(propertyId);
    }

    private String photoKey(UUID propertyId) {
        var row = admin.sql("select photo_key from properties where id = ?").param(propertyId).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Property"));
        return (String) row.get("photo_key");
    }

    /** Who runs and works at a property, owners first. */
    @Transactional(value = "adminTx", readOnly = true)
    public List<Member> team(UUID propertyId) {
        return admin.sql("""
                select u.id, u.name, u.phone, pu.role::text as role, pu.active
                from property_users pu join users u on u.id = pu.user_id
                where pu.property_id = ?
                order by pu.role <> 'owner', pu.active desc, u.name""")
                .param(propertyId)
                .query((rs, i) -> new Member(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("phone"), rs.getString("role"), rs.getBoolean("active")))
                .list();
    }

    @Transactional(value = "adminTx", readOnly = true)
    public List<Plan> plans() {
        return admin.sql("select code, name, max_rooms, monthly_paise from plans where active order by monthly_paise")
                .query((rs, i) -> new Plan(rs.getString("code"), rs.getString("name"), rs.getInt("max_rooms"), rs.getLong("monthly_paise")))
                .list();
    }

    public record NewPropertyInput(String orgName, String propertyName, String city, String state, String phone,
                                   String ownerName, String ownerPhone, String ownerEmail, String planCode) {}
    /** {@code ownerPassword} is shown once and never stored in the clear; null when the owner already had one. */
    public record NewPropertyResult(UUID orgId, UUID propertyId, UUID ownerId, String ownerPhone, String ownerEmail, String code, String ownerPassword) {}

    /**
     * Onboard a property: organisation, property, first owner and their membership, in one transaction. The
     * property gets its code and starts with the basics only. The owner signs in with the code, their email
     * and the first password returned here, which they change after signing in.
     */
    @Transactional("adminTx")
    public NewPropertyResult createProperty(NewPropertyInput in, CurrentUser actor) {
        if (blank(in.orgName()) || blank(in.propertyName()) || blank(in.ownerName())) throw new BadRequestException("Trust, property and owner names are required");
        String ownerPhone = OtpService.normalisePhone(in.ownerPhone());
        String ownerEmail = OtpService.normaliseEmail(in.ownerEmail());
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
                        .params(in.ownerName().trim(), ownerPhone, ownerEmail)
                        .query(UUID.class).single()
                : (UUID) existing.getFirst().get("id");
        // Sign-in is by email: an existing account without one gets this one, and one it already has is kept.
        String signInEmail = admin.sql("update users set email = coalesce(email, ?) where id = ? returning email").params(ownerEmail, ownerId).query(String.class).single();
        // Someone who already signs in somewhere keeps the password they have.
        String password = existing.isEmpty() || !Boolean.TRUE.equals(existing.getFirst().get("has_password")) ? passwords.generate() : null;
        if (password != null) admin.sql("update users set password_hash = ?, must_change_password = true, updated_at = now() where id = ?").params(passwords.hash(password), ownerId).update();
        admin.sql("""
                insert into property_users(property_id, user_id, role) values (?, ?, 'owner')
                on conflict (property_id, user_id) do update set role = 'owner', active = true""")
                .params(propertyId, ownerId).update();

        seedRooms(propertyId);

        audit.recordPlatform(propertyId, "properties", propertyId.toString(), "onboard", null,
                Map.of("org", in.orgName(), "property", in.propertyName(), "ownerPhone", mask(ownerPhone)), actor.id());
        return new NewPropertyResult(orgId, propertyId, ownerId, ownerPhone, signInEmail, (String) property.get("code"), password);
    }

    /**
     * A new property opens with a floor plan already in it: one room type and 25 rooms over the ground,
     * first and second floors (G01-G09, 101-108, 201-208). Almost every property here is shaped like this,
     * and a desk that can start taking bookings on day one beats an empty rooms screen. The owner renames,
     * re-rates or deactivates whatever does not match.
     */
    private void seedRooms(UUID propertyId) {
        UUID typeId = admin.sql("insert into room_types(property_id, name, max_occupancy, sort_order) values (?, 'Standard', 2, 0) returning id")
                .param(propertyId).query(UUID.class).single();
        for (int floor = 0; floor <= 2; floor++) {
            String prefix = floor == 0 ? "G" : String.valueOf(floor);
            for (int n = 1; n <= (floor == 0 ? 9 : 8); n++)
                admin.sql("insert into rooms(property_id, room_type_id, number, floor) values (?, ?, ?, ?)")
                        .params(propertyId, typeId, prefix + String.format("%02d", n), floor).update();
        }
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
