package in.pms.users;

import in.pms.audit.AuditService;
import in.pms.auth.CurrentUser;
import in.pms.auth.OtpService;
import in.pms.auth.PasswordService;
import in.pms.auth.Permissions;
import in.pms.auth.SessionService;
import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Members of the current property (PRD U1–U2): invite by phone, change role, deactivate, set PIN and password.
 * Runs on the admin role because users and memberships are platform tables; every call checks that the
 * membership being changed belongs to the caller's current property.
 */
@Service
public class UserAdminService {
    private final JdbcClient admin;
    private final PasswordService passwords;
    private final SessionService sessions;
    private final AuditService audit;

    public UserAdminService(@Qualifier("adminJdbc") JdbcClient admin, PasswordService passwords, SessionService sessions, AuditService audit) {
        this.admin = admin; this.passwords = passwords; this.sessions = sessions; this.audit = audit;
    }

    public record Member(UUID userId, String name, String phone, String email, String role, boolean active, boolean hasPin) {}
    public record InviteInput(String name, String phone, String email, String role) {}

    @Transactional(value = "adminTx", readOnly = true)
    public List<Member> members() {
        return admin.sql("""
                select u.id, u.name, u.phone, u.email, pu.role::text as role, pu.active, pu.approval_pin_hash is not null as has_pin
                from property_users pu join users u on u.id = pu.user_id where pu.property_id = ? order by pu.role desc, u.name""")
                .param(TenantContext.require()).query(this::mapMember).list();
    }

    /** Creates the user if the phone is new, then adds the membership. Idempotent for an existing member. */
    @Transactional("adminTx")
    public Member invite(InviteInput in, CurrentUser actor) {
        String phone = OtpService.normalisePhone(in.phone());
        String role = grantable(in.role(), actor);
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        UUID property = TenantContext.require();
        UUID userId = admin.sql("select id from users where phone = ?").param(phone).query(UUID.class).optional().orElseGet(() ->
                admin.sql("insert into users(name, phone, email) values (?, ?, ?) returning id").params(in.name().trim(), phone, blank(in.email())).query(UUID.class).single());
        // Inviting someone who is already a member changes their role: the same rule as setRole applies, so an
        // admin cannot demote an owner by inviting their number again.
        if (userId.equals(actor.id())) throw new BadRequestException("You cannot change your own role");
        admin.sql("select role::text from property_users where property_id = ? and user_id = ?").params(property, userId).query(String.class).optional()
                .ifPresent(existing -> grantable(existing, actor));
        admin.sql("""
                insert into property_users(property_id, user_id, role) values (?, ?, ?::user_role)
                on conflict (property_id, user_id) do update set role = excluded.role, active = true""")
                .params(property, userId, role).update();
        audit.recordPlatform(property, "property_users", userId.toString(), "invite", null, Map.of("role", role, "phone", mask(phone)), actor.id());
        return member(userId);
    }

    @Transactional("adminTx")
    public Member setRole(UUID userId, String role, CurrentUser actor) {
        if (userId.equals(actor.id())) throw new BadRequestException("You cannot change your own role");
        Member before = member(userId);
        grantable(before.role(), actor); // an admin cannot demote an owner
        admin.sql("update property_users set role = ?::user_role where property_id = ? and user_id = ?").params(grantable(role, actor), TenantContext.require(), userId).update();
        audit.recordPlatform(TenantContext.require(), "property_users", userId.toString(), "role", Map.of("role", before.role()), Map.of("role", role), actor.id());
        return member(userId);
    }

    /** Removes access to this property and revokes every session so the person is logged out within a minute. */
    @Transactional("adminTx")
    public void deactivate(UUID userId, CurrentUser actor) {
        if (userId.equals(actor.id())) throw new BadRequestException("You cannot deactivate yourself");
        Member before = member(userId);
        grantable(before.role(), actor); // an admin cannot remove an owner
        admin.sql("update property_users set active = false where property_id = ? and user_id = ?").params(TenantContext.require(), userId).update();
        sessions.revokeAll(userId);
        audit.recordPlatform(TenantContext.require(), "property_users", userId.toString(), "deactivate", Map.of("role", before.role()), null, actor.id());
    }

    /** Managers set their own PIN; owners may set anyone's. 4–6 digits. */
    @Transactional("adminTx")
    public void setPin(UUID userId, String pin, CurrentUser actor) {
        if (!actor.id().equals(userId) && !actor.hasRole(CurrentUser.Role.OWNER)) throw new ForbiddenException("Only an owner can set another user's PIN");
        if (pin == null || !pin.matches("\\d{4,6}")) throw new BadRequestException("PIN must be 4 to 6 digits");
        Member m = member(userId);
        if (!APPROVER_ROLES.contains(m.role())) throw new BadRequestException("Only roles that approve exceptions have an approval PIN");
        admin.sql("update property_users set approval_pin_hash = ? where property_id = ? and user_id = ?").params(passwords.hash(pin), TenantContext.require(), userId).update();
        audit.recordPlatform(TenantContext.require(), "property_users", userId.toString(), "pin", null, null, actor.id());
    }

    /** A user sets their own email login password. */
    @Transactional("adminTx")
    public void setPassword(String email, String password, CurrentUser actor) {
        if (password == null || password.length() < 8) throw new BadRequestException("Password must be at least 8 characters");
        String e = email == null || email.isBlank() ? null : email.trim().toLowerCase();
        if (e == null) throw new BadRequestException("Email is required for password login");
        admin.sql("update users set email = ?, password_hash = ?, updated_at = now() where id = ?").params(e, passwords.hash(password), actor.id()).update();
        audit.recordPlatform(null, "users", actor.id().toString(), "password", null, null, actor.id());
    }

    /** Roles that approve something (a discount, refund, cancellation or credit note) for someone else. */
    private static final java.util.Set<String> APPROVER_ROLES = java.util.stream.Stream.of(Permissions.DISCOUNT, Permissions.REFUND, Permissions.INVOICE_EDIT, Permissions.RESERVATIONS_CANCEL)
            .flatMap(p -> Permissions.rolesWith(p).stream()).collect(java.util.stream.Collectors.toUnmodifiableSet());

    /** A known role, and only an owner hands out (or takes away) owner and admin. */
    private static String grantable(String r, CurrentUser actor) {
        if (r == null || !Permissions.ROLES.contains(r)) throw new BadRequestException("Role must be one of " + Permissions.ROLES);
        if (List.of("owner", "admin").contains(r) && !actor.hasRole(CurrentUser.Role.OWNER)) throw new ForbiddenException("Only an owner can grant or change the owner and admin roles");
        return r;
    }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
    private static String mask(String phone) { return "******" + phone.substring(6); }

    private Member member(UUID userId) {
        return admin.sql("""
                select u.id, u.name, u.phone, u.email, pu.role::text as role, pu.active, pu.approval_pin_hash is not null as has_pin
                from property_users pu join users u on u.id = pu.user_id where pu.property_id = ? and pu.user_id = ?""")
                .params(TenantContext.require(), userId).query(this::mapMember).optional().orElseThrow(() -> new NotFoundException("Member"));
    }

    private Member mapMember(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Member(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("phone"), rs.getString("email"), rs.getString("role"), rs.getBoolean("active"), rs.getBoolean("has_pin"));
    }
}
