package in.pms.audit;

import in.pms.common.BadRequestException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * Who changed what, and from what to what (PRD U3), for the property the user is working in. Read-only, as the
 * log itself is: neither application role may update or delete a row of it.
 */
@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasAuthority('PERM_audit.view')")
public class AuditController {
    private final JdbcClient jdbc;

    public AuditController(@Qualifier("jdbc") JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Entry(UUID id, OffsetDateTime at, String userName, String table, String rowId, String action, String before, String after) {}

    /** Newest first, filtered by day range, the kind of record, the person, and a word in the change. */
    @GetMapping
    @Transactional(readOnly = true)
    public List<Entry> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                            @RequestParam(required = false) String table, @RequestParam(required = false) UUID userId,
                            @RequestParam(required = false) String q) {
        if (to.isBefore(from)) throw new BadRequestException("Check the dates");
        UUID p = TenantContext.require();
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(p).query(String.class).single());
        String like = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.sql("""
                select a.id, a.at, u.name as user_name, a.table_name, a.row_id, a.action, a.before::text as before, a.after::text as after
                from audit_log a left join users u on u.id = a.user_id
                where a.property_id = ? and a.at >= ? and a.at < ?
                  and (cast(? as text) is null or a.table_name = ?)
                  and (cast(? as uuid) is null or a.user_id = ?)
                  and (cast(? as text) is null or lower(a.action || ' ' || coalesce(a.before::text, '') || ' ' || coalesce(a.after::text, '') || ' ' || a.row_id) like ?)
                order by a.at desc limit 300""")
                .params(p, from.atStartOfDay(zone).toOffsetDateTime(), to.plusDays(1).atStartOfDay(zone).toOffsetDateTime(), table, table, userId, userId, like, like)
                .query((rs, i) -> new Entry(rs.getObject("id", UUID.class), rs.getObject("at", OffsetDateTime.class), rs.getString("user_name"), rs.getString("table_name"),
                        rs.getString("row_id"), rs.getString("action"), rs.getString("before"), rs.getString("after"))).list();
    }

    /** The kinds of record the log holds for this property, for the filter. */
    @GetMapping("/tables")
    @Transactional(readOnly = true)
    public List<String> tables() {
        return jdbc.sql("select distinct table_name from audit_log where property_id = ? order by 1").param(TenantContext.require()).query(String.class).list();
    }
}
