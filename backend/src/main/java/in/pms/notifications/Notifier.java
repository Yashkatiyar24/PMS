package in.pms.notifications;

import in.pms.auth.Permissions;
import in.pms.messaging.Outbox;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * Tells the staff that something happened. Call it inside the transaction that made the change: the in-app row
 * and the push messages commit with it or not at all, and the pushes go through the outbox, so a push outage
 * never fails a check-in.
 *
 * <p>{@code permission} says who cares: a new booking goes to whoever can check guests in, a repair to whoever
 * handles maintenance. Null means everyone at the property.
 */
@Service
public class Notifier {
    private final JdbcClient jdbc;
    private final JdbcClient admin;
    private final Outbox outbox;

    public Notifier(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient admin, Outbox outbox) {
        this.jdbc = jdbc; this.admin = admin; this.outbox = outbox;
    }

    public void notify(String kind, String title, String body, String link, String permission) {
        UUID property = TenantContext.require();
        UUID id = jdbc.sql("insert into notifications(property_id, kind, title, body, link, permission) values (?, ?, ?, ?, ?, ?) returning id")
                .params(property, kind, title, body == null ? "" : body, link, permission).query(UUID.class).single();

        boolean pushOn = !Boolean.FALSE.equals(jdbc.sql("select (settings->>'push_enabled')::boolean from properties where id = ?").param(property).query(Boolean.class).optional().orElse(null));
        if (!pushOn) return;
        // Tokens live on the platform side (the app role cannot read them), so they are looked up on the admin role.
        String[] roles = (permission == null ? Permissions.ROLES : Permissions.rolesWith(permission)).toArray(String[]::new);
        for (String token : admin.sql("""
                select t.token from push_tokens t join property_users pu on pu.user_id = t.user_id join users u on u.id = t.user_id
                where pu.property_id = ? and pu.active and u.active and pu.role::text = any(?)""").params(property, roles).query(String.class).list())
            outbox.enqueue(property, "push", pushPayload(token, kind, title, body, link, id), "notify:" + id + ":" + token.hashCode());
    }

    /** What the phone needs to open the right screen on tap: the kind, the desk-app link and the feed row's id. */
    static Map<String, String> pushPayload(String token, String kind, String title, String body, String link, UUID id) {
        var payload = new java.util.HashMap<String, String>();
        payload.put("token", token);
        payload.put("title", title);
        payload.put("body", body == null ? "" : body);
        payload.put("kind", kind == null ? "" : kind);
        payload.put("link", link == null ? "" : link);
        payload.put("notificationId", id.toString());
        return payload;
    }
}
