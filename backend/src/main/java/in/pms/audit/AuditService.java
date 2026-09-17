package in.pms.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Append-only audit trail. Every write to bookings, units, folios, lines, payments, receipts, rooms and
 * settings calls {@link #record}. The table forbids UPDATE and DELETE for both application roles.
 *
 * <p>Runs inside the caller's transaction, so an audit row never exists without its change and vice versa.
 */
@Service
public class AuditService {
    private final JdbcClient jdbc;
    private final JdbcClient adminJdbc;
    private final ObjectMapper json;

    public AuditService(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient adminJdbc, ObjectMapper json) {
        this.jdbc = jdbc; this.adminJdbc = adminJdbc; this.json = json;
    }

    /** Record a change in the current tenant. {@code before}/{@code after} may be any JSON-serialisable object or null. */
    public void record(String table, String rowId, String action, Object before, Object after, UUID userId) {
        jdbc.sql("insert into audit_log(property_id, user_id, table_name, row_id, action, before, after) values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)")
                .params(TenantContext.require(), userId, table, rowId, action, toJson(before), toJson(after))
                .update();
    }

    /** Record a platform-level change (no tenant), e.g. user invited, property created, admin viewed guest data. */
    public void recordPlatform(UUID propertyId, String table, String rowId, String action, Object before, Object after, UUID userId) {
        adminJdbc.sql("insert into audit_log(property_id, user_id, table_name, row_id, action, before, after) values (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)")
                .params(propertyId, userId, table, rowId, action, toJson(before), toJson(after))
                .update();
    }

    private String toJson(Object o) {
        if (o == null) return null;
        try { return json.writeValueAsString(o); } catch (Exception e) { throw new IllegalStateException("Cannot serialise audit payload", e); }
    }
}
