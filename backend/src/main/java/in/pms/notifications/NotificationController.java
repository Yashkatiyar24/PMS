package in.pms.notifications;

import in.pms.auth.CurrentUser;
import in.pms.common.BadRequestException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** The in-app feed: what happened lately that this person's role cares about, and how much of it is new. */
@RestController
@RequestMapping("/api/notifications")
@PreAuthorize("hasRole('LIMITED')")
public class NotificationController {
    private final JdbcClient jdbc;
    private final JdbcClient admin;

    public NotificationController(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient admin) { this.jdbc = jdbc; this.admin = admin; }

    public record Item(UUID id, String kind, String title, String body, String link, OffsetDateTime createdAt, boolean unread) {}
    public record Feed(List<Item> items, int unread) {}

    @GetMapping
    @Transactional(readOnly = true)
    public Feed feed(@AuthenticationPrincipal CurrentUser u) {
        UUID p = TenantContext.require();
        String[] mine = u.permissions().toArray(String[]::new);
        OffsetDateTime seen = jdbc.sql("select seen_at from notification_reads where property_id = ? and user_id = ?").params(p, u.id())
                .query(OffsetDateTime.class).optional().orElse(OffsetDateTime.parse("1970-01-01T00:00Z"));
        List<Item> items = jdbc.sql("""
                select id, kind, title, body, link, created_at from notifications
                where property_id = ? and (permission is null or permission = any(?)) order by created_at desc limit 50""")
                .params(p, mine).query((rs, i) -> {
                    OffsetDateTime at = rs.getObject("created_at", OffsetDateTime.class);
                    return new Item(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("title"), rs.getString("body"), rs.getString("link"), at, at.isAfter(seen));
                }).list();
        return new Feed(items, (int) items.stream().filter(Item::unread).count());
    }

    @PostMapping("/seen")
    @Transactional
    public ResponseEntity<Void> seen(@AuthenticationPrincipal CurrentUser u) {
        jdbc.sql("""
                insert into notification_reads(property_id, user_id, seen_at) values (?, ?, now())
                on conflict (property_id, user_id) do update set seen_at = now()""").params(TenantContext.require(), u.id()).update();
        return ResponseEntity.noContent().build();
    }

    public record TokenInput(String token, String platform) {}

    /** A device registers for push (FCM). Tokens are platform data, so they are written on the admin role, for this user only. */
    @PostMapping("/push-token")
    @Transactional("adminTx")
    public ResponseEntity<Void> pushToken(@AuthenticationPrincipal CurrentUser u, @RequestBody TokenInput in) {
        if (in.token() == null || in.token().isBlank() || in.token().length() > 4096) throw new BadRequestException("A push token is required");
        admin.sql("""
                insert into push_tokens(user_id, token, platform) values (?, ?, ?)
                on conflict (token) do update set user_id = excluded.user_id, last_seen_at = now()""")
                .params(u.id(), in.token(), in.platform() == null ? "web" : in.platform()).update();
        return ResponseEntity.noContent().build();
    }
}
