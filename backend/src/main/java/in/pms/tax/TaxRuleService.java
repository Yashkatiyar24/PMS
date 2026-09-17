package in.pms.tax;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Effective-dated tax slabs per property (PRD P5). The engine picks the newest rule not after the line date. */
@Service
public class TaxRuleService {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final AuditService audit;

    public TaxRuleService(@Qualifier("jdbc") JdbcClient jdbc, ObjectMapper json, AuditService audit) { this.jdbc = jdbc; this.json = json; this.audit = audit; }

    public record TaxRuleView(UUID id, LocalDate effectiveFrom, TaxRules rules) {}

    @Transactional(readOnly = true)
    public List<TaxRuleView> list() {
        return jdbc.sql("select id, effective_from, rules::text from tax_rules where property_id = ? order by effective_from desc").param(TenantContext.require())
                .query((rs, i) -> new TaxRuleView(rs.getObject("id", UUID.class), rs.getObject("effective_from", LocalDate.class), parse(rs.getString("rules")))).list();
    }

    /** Rules in force on a date; the built-in default when the property has none. */
    @Transactional(readOnly = true)
    public TaxRules inForce(LocalDate date) {
        return jdbc.sql("select rules::text from tax_rules where property_id = ? and effective_from <= ? order by effective_from desc limit 1")
                .params(TenantContext.require(), date).query(String.class).optional().map(this::parse).orElse(TaxRules.DEFAULT);
    }

    @Transactional
    public TaxRuleView add(LocalDate effectiveFrom, TaxRules rules, UUID userId) {
        if (effectiveFrom == null) throw new BadRequestException("Effective date is required");
        if (rules == null || rules.slabs() == null || rules.slabs().isEmpty()) throw new BadRequestException("At least one slab is required");
        if (rules.slabs().get(rules.slabs().size() - 1).uptoPaise() != null) throw new BadRequestException("The last slab must have no upper limit");
        for (var s : rules.slabs()) if (s.bp() < 0 || s.bp() > 10000) throw new BadRequestException("Rate must be between 0 and 100%");
        UUID id;
        try {
            id = jdbc.sql("insert into tax_rules(property_id, effective_from, rules, created_by) values (?, ?, ?::jsonb, ?) returning id")
                    .params(TenantContext.require(), effectiveFrom, json.writeValueAsString(rules), userId).query(UUID.class).single();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
        audit.record("tax_rules", id.toString(), "create", null, rules, userId);
        return new TaxRuleView(id, effectiveFrom, rules);
    }

    private TaxRules parse(String raw) {
        try { return json.readValue(raw, TaxRules.class); } catch (Exception e) { throw new IllegalStateException("Corrupt tax rules", e); }
    }
}
