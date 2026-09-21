package in.pms.auth;

import in.pms.config.PmsProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Database-backed sessions. The cookie carries a random 256-bit token; only its SHA-256 is stored, so a
 * database leak does not yield usable sessions. Owners can list and revoke sessions; deactivating a user
 * revokes all of theirs (PRD U1).
 *
 * <p>Runs on the admin role: sessions and memberships are platform data, read before any tenant is known.
 */
@Service
public class SessionService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient adminJdbc;
    private final PmsProperties props;

    public SessionService(@Qualifier("adminJdbc") JdbcClient adminJdbc, PmsProperties props) {
        this.adminJdbc = adminJdbc; this.props = props;
    }

    public record NewSession(String token, UUID sessionId, OffsetDateTime expiresAt) {}

    /** Create a session for a user who has just proven their identity. Returns the raw token for the cookie. */
    @Transactional("adminTx")
    public NewSession create(UUID userId, String deviceName) { return create(userId, deviceName, null); }

    /** As above, working in {@code propertyId} from the start: the property whose code they signed in with. */
    @Transactional("adminTx")
    public NewSession create(UUID userId, String deviceName, UUID propertyId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        int days = sessionDaysFor(userId);
        OffsetDateTime expires = OffsetDateTime.now().plusDays(days);
        // Default the property to the user's only membership so the first screen is useful.
        List<UUID> props = adminJdbc.sql("select property_id from property_users where user_id = ? and active order by created_at").param(userId).query(UUID.class).list();
        UUID current = propertyId != null && props.contains(propertyId) ? propertyId : props.size() == 1 ? props.get(0) : null;
        UUID id = adminJdbc.sql("insert into sessions(user_id, token_hash, device_name, current_property_id, expires_at) values (?, ?, ?, ?, ?) returning id")
                .params(userId, sha256(token), deviceName == null ? "" : deviceName.substring(0, Math.min(80, deviceName.length())), current, expires)
                .query(UUID.class).single();
        return new NewSession(token, id, expires);
    }

    /** The shortest {@code session_days} among the user's properties, or 30 when they have none. */
    private int sessionDaysFor(UUID userId) {
        List<Integer> days = adminJdbc.sql("""
                select coalesce((p.settings->>'session_days')::int, 30)
                from property_users pu join properties p on p.id = pu.property_id
                where pu.user_id = ? and pu.active""").param(userId).query(Integer.class).list();
        return days.stream().mapToInt(Integer::intValue).min().orElse(30);
    }

    /** A session nobody has used for this long is over, however long it was valid for: a lost phone stops working. */
    static final int IDLE_DAYS = 14;
    private static final String LIVE = "s.revoked_at is null and s.expires_at > now() and s.last_seen_at > now() - interval '" + IDLE_DAYS + " days'";

    /** Resolve a cookie token to a principal, or empty if unknown, expired, idle too long or revoked. Touches last_seen_at. */
    @Transactional("adminTx")
    public Optional<CurrentUser> resolve(String token) {
        if (token == null || token.length() < 20) return Optional.empty();
        var row = adminJdbc.sql("""
                select s.id as session_id, s.current_property_id, u.id as user_id, u.name, u.is_super_admin, u.must_change_password
                from sessions s join users u on u.id = s.user_id
                where s.token_hash = ? and """ + " " + LIVE + " and u.active")
                .param(sha256(token)).query().listOfRows().stream().findFirst();
        if (row.isEmpty()) return Optional.empty();
        var r = row.get();
        UUID sessionId = (UUID) r.get("session_id");
        UUID userId = (UUID) r.get("user_id");
        adminJdbc.sql("update sessions set last_seen_at = now() where id = ? and last_seen_at < now() - interval '5 minutes'").param(sessionId).update();

        List<CurrentUser.Membership> memberships = adminJdbc.sql("""
                select pu.property_id, p.name, pu.role::text as role
                from property_users pu join properties p on p.id = pu.property_id
                where pu.user_id = ? and pu.active and p.active order by p.name""")
                .param(userId).query((rs, i) -> new CurrentUser.Membership(rs.getObject("property_id", UUID.class), rs.getString("name"),
                        Permissions.rank(rs.getString("role")), rs.getString("role")))
                .list();

        UUID selected = (UUID) r.get("current_property_id");
        var membership = memberships.stream().filter(m -> m.propertyId().equals(selected)).findFirst();
        UUID current = membership.isEmpty() ? null : selected; // membership may have been removed since the session was created
        String position = membership.map(CurrentUser.Membership::position).orElse(null);
        Set<String> permissions = position == null ? Set.of()
                : Permissions.of(position, adminJdbc.sql("select unnest(modules) from properties where id = ?").param(current).query(String.class).list());
        // The subscription state travels with the principal, so the billing gate and the app's banner never disagree.
        String billing = current == null ? null : adminJdbc.sql(
                "select o.billing_status::text from properties p join organisations o on o.id = p.org_id where p.id = ?")
                .param(current).query(String.class).optional().orElse(null);
        return Optional.of(new CurrentUser(userId, (String) r.get("name"), Boolean.TRUE.equals(r.get("is_super_admin")), sessionId, current,
                membership.map(CurrentUser.Membership::role).orElse(null), memberships, position, permissions, billing,
                Boolean.TRUE.equals(r.get("must_change_password"))));
    }

    /** Switch the working property; refused unless the user is a member. */
    @Transactional("adminTx")
    public void switchProperty(CurrentUser user, UUID propertyId) {
        boolean member = user.memberships().stream().anyMatch(m -> m.propertyId().equals(propertyId));
        if (!member) throw new in.pms.common.ForbiddenException("Not a member of that property");
        adminJdbc.sql("update sessions set current_property_id = ? where id = ?").params(propertyId, user.sessionId()).update();
    }

    @Transactional("adminTx")
    public void revoke(UUID sessionId, UUID userId) {
        adminJdbc.sql("update sessions set revoked_at = now() where id = ? and user_id = ? and revoked_at is null").params(sessionId, userId).update();
    }

    @Transactional("adminTx")
    public void revokeAll(UUID userId) {
        adminJdbc.sql("update sessions set revoked_at = now() where user_id = ? and revoked_at is null").param(userId).update();
    }

    /** Only the sessions working in {@code propertyId}: one property removing someone must not sign them out of another. */
    @Transactional("adminTx")
    public void revokeAt(UUID userId, UUID propertyId) {
        adminJdbc.sql("update sessions set revoked_at = now() where user_id = ? and current_property_id = ? and revoked_at is null").params(userId, propertyId).update();
    }

    public record SessionView(UUID id, String deviceName, OffsetDateTime createdAt, OffsetDateTime lastSeenAt, boolean current) {}

    @Transactional(value = "adminTx", readOnly = true)
    public List<SessionView> list(CurrentUser user) {
        return adminJdbc.sql("select s.id, s.device_name, s.created_at, s.last_seen_at from sessions s where s.user_id = ? and " + LIVE + " order by s.last_seen_at desc")
                .param(user.id()).query((rs, i) -> new SessionView(rs.getObject("id", UUID.class), rs.getString("device_name"),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getObject("last_seen_at", OffsetDateTime.class), rs.getObject("id", UUID.class).equals(user.sessionId())))
                .list();
    }

    static String sha256(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    public String cookieName() { return "pms_session"; }
    public boolean cookieSecure() { return props.cookieSecure(); }
}
