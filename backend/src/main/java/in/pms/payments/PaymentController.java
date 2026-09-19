package in.pms.payments;

import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The desk's view of online payments: what was asked for, what arrived, and a button to ask the gateway again. */
@RestController
@RequestMapping("/api/payments/online")
@PreAuthorize("hasAuthority('PERM_revenue.view')")
public class PaymentController {
    private final PaymentService payments;
    private final JdbcClient jdbc;

    public PaymentController(PaymentService payments, @Qualifier("jdbc") JdbcClient jdbc) { this.payments = payments; this.jdbc = jdbc; }

    @GetMapping
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Map<String, Object> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single());
        List<PaymentService.Order> orders = payments.orders(from.atStartOfDay(zone).toOffsetDateTime(), to.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
        return Map.of("enabled", payments.enabled(), "orders", orders);
    }

    /** Ask the gateway what happened to one order, and apply it. */
    @PostMapping("/{id}/check")
    public PaymentService.Order check(@PathVariable UUID id) { return payments.check(id); }
}
