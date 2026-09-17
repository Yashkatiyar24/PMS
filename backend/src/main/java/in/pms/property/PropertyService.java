package in.pms.property;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** The property's own record (PRD P1). Settings live separately in the registry. */
@Service
public class PropertyService {
    private final JdbcClient jdbc;
    private final AuditService audit;

    public PropertyService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    public record Property(UUID id, String name, String address, String city, String state, String phone, String email, String gstin,
                           String trustRegNo, String reg12a, String reg80g, String timezone) {}
    public record PropertyInput(String name, String address, String city, String state, String phone, String email, String gstin,
                                String trustRegNo, String reg12a, String reg80g, String timezone) {}

    @Transactional(readOnly = true)
    public Property current() { return find(); }

    @Transactional
    public Property update(PropertyInput in, UUID userId) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        String gstin = in.gstin() == null || in.gstin().isBlank() ? null : in.gstin().trim().toUpperCase();
        if (gstin != null && !gstin.matches("\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]")) throw new BadRequestException("GSTIN format is invalid");
        String tz = in.timezone() == null || in.timezone().isBlank() ? "Asia/Kolkata" : in.timezone();
        try { java.time.ZoneId.of(tz); } catch (Exception e) { throw new BadRequestException("Unknown timezone"); }
        Property before = find();
        jdbc.sql("""
                update properties set name = ?, address = ?, city = ?, state = ?, phone = ?, email = ?, gstin = ?, trust_reg_no = ?, reg_12a = ?, reg_80g = ?, timezone = ?, updated_at = now()
                where id = ?""")
                .params(in.name().trim(), nz(in.address()), nz(in.city()), nz(in.state()), nz(in.phone()), blank(in.email()), gstin, blank(in.trustRegNo()), blank(in.reg12a()), blank(in.reg80g()), tz, TenantContext.require())
                .update();
        Property after = find();
        audit.record("properties", after.id().toString(), "update", before, after, userId);
        return after;
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private Property find() {
        return jdbc.sql("select * from properties where id = ?").param(TenantContext.require()).query((rs, i) -> new Property(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("address"), rs.getString("city"), rs.getString("state"), rs.getString("phone"), rs.getString("email"),
                rs.getString("gstin"), rs.getString("trust_reg_no"), rs.getString("reg_12a"), rs.getString("reg_80g"), rs.getString("timezone"))).single();
    }
}
