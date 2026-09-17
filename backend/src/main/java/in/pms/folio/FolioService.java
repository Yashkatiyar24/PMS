package in.pms.folio;

import in.pms.audit.AuditService;
import in.pms.charges.ChargeEngine;
import in.pms.charges.StayCharge;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tax.TaxEngine;
import in.pms.tax.TaxRuleService;
import in.pms.tax.TaxRules;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * Folio lines, payments and cached totals (PRD F1, F2, F7, F8). Room charges are regenerated from the
 * charge engine whenever a stay changes; manual lines (extras, discounts, deposits) are kept.
 * Every write recomputes the totals in the same transaction and leaves an audit row.
 */
@Service
public class FolioService {
    private static final Set<String> MANUAL_KINDS = Set.of("extra", "discount", "deposit", "deposit_refund", "forfeit", "adjustment");
    private static final Set<String> CHARGE_KINDS = Set.of("room_charge", "day_use", "extra", "discount", "forfeit", "adjustment");

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final SettingsService settings;
    private final TaxRuleService taxRules;

    public FolioService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, SettingsService settings, TaxRuleService taxRules) {
        this.jdbc = jdbc; this.audit = audit; this.settings = settings; this.taxRules = taxRules;
    }

    // ---------- Read ----------

    @Transactional(readOnly = true)
    public Folio get(UUID folioId) { return load(folioId); }

    @Transactional(readOnly = true)
    public Folio forBooking(UUID bookingId) {
        UUID id = jdbc.sql("select id from folios where booking_id = ? and property_id = ?").params(bookingId, TenantContext.require()).query(UUID.class).optional()
                .orElseThrow(() -> new NotFoundException("Folio"));
        return load(id);
    }

    // ---------- Lifecycle ----------

    /** Called once by the booking service when a booking is created. */
    public UUID create(UUID bookingId) {
        return jdbc.sql("insert into folios(property_id, booking_id) values (?, ?) returning id").params(TenantContext.require(), bookingId).query(UUID.class).single();
    }

    public record Unit(UUID unitId, String label, long ratePaise, OffsetDateTime arriveAt, OffsetDateTime departAt) {}

    /**
     * Replace the engine-generated lines with fresh ones for the given units. Manual lines are untouched.
     *
     * <p>Tax is decided per line from the rules in force on that line's date and the property's current
     * registration. An open folio therefore always reflects today's rules: if the trust registers for GST
     * mid-stay, the nights not yet invoiced are re-priced at checkout. That is the intended behaviour, and it
     * stops at the invoice, whose snapshot is frozen at issue and never recomputed.
     */
    public void regenerateRoomCharges(UUID folioId, List<Unit> units, ZoneId zone, boolean hasGstin, UUID userId) {
        Settings s = settings.current();
        jdbc.sql("delete from folio_lines where folio_id = ? and property_id = ? and auto").params(folioId, TenantContext.require()).update();
        for (Unit u : units) {
            for (StayCharge c : ChargeEngine.compute(new ChargeEngine.Stay(u.arriveAt(), u.departAt(), u.ratePaise(), u.label(), zone), s)) {
                String kind = c.kind() == StayCharge.Kind.DAY_USE ? "day_use" : "room_charge";
                TaxRules rules = taxRules.inForce(c.date());
                int bp = TaxEngine.rateBp(s, hasGstin, rules, u.ratePaise());
                TaxEngine.Tax tax = TaxEngine.on(c.amountPaise(), bp);
                insertLine(folioId, kind, c.description(), c.qty(), c.unitPaise(), bp, tax.cgstPaise(), tax.sgstPaise(), c.date(), true, null, null, userId);
            }
        }
        recompute(folioId);
    }

    public record LineInput(String kind, String description, int qty, long unitPaise, LocalDate lineDate, String reason) {}

    /** Manual line. Discounts and adjustments must be negative and carry a reason; the caller supplies the approver. */
    @Transactional
    public Folio addLine(UUID folioId, LineInput in, UUID userId, UUID approvedBy) {
        if (!MANUAL_KINDS.contains(in.kind())) throw new BadRequestException("Line kind must be one of " + MANUAL_KINDS);
        if (in.qty() < 1) throw new BadRequestException("Quantity must be at least 1");
        if (in.description() == null || in.description().isBlank()) throw new BadRequestException("Description is required");
        boolean negative = in.unitPaise() < 0;
        switch (in.kind()) {
            case "discount" -> { if (!negative) throw new BadRequestException("A discount must be negative"); requireReason(in); }
            case "deposit_refund" -> { if (!negative) throw new BadRequestException("A deposit refund must be negative"); }
            case "adjustment" -> requireReason(in);
            case "extra", "deposit", "forfeit" -> { if (negative) throw new BadRequestException(in.kind() + " must be positive"); }
        }
        Folio before = load(folioId);
        if (!"open".equals(before.status())) throw new ConflictException("Folio is " + before.status());
        boolean taxable = "extra".equals(in.kind()) || "forfeit".equals(in.kind());
        int bp = 0; long cgst = 0, sgst = 0;
        if (taxable) {
            Settings s = settings.current();
            boolean hasGstin = hasGstin();
            bp = TaxEngine.rateBp(s, hasGstin, taxRules.inForce(in.lineDate()), Math.abs(in.unitPaise()));
            var t = TaxEngine.on(in.unitPaise() * in.qty(), bp); cgst = t.cgstPaise(); sgst = t.sgstPaise();
        }
        UUID lineId = insertLine(folioId, in.kind(), in.description().trim(), in.qty(), in.unitPaise(), bp, cgst, sgst, in.lineDate() == null ? LocalDate.now() : in.lineDate(), false, in.reason(), approvedBy, userId);
        recompute(folioId);
        Folio after = load(folioId);
        audit.record("folio_lines", lineId.toString(), "create", null, after.lines().stream().filter(l -> l.id().equals(lineId)).findFirst().orElse(null), userId);
        return after;
    }

    @Transactional
    public Folio removeLine(UUID folioId, UUID lineId, String reason, UUID userId, UUID approvedBy) {
        Folio before = load(folioId);
        Folio.Line line = before.lines().stream().filter(l -> l.id().equals(lineId)).findFirst().orElseThrow(() -> new NotFoundException("Line"));
        if (line.auto()) throw new BadRequestException("Room charges are generated from the stay; change the dates instead");
        if (reason == null || reason.isBlank()) throw new BadRequestException("A reason is required");
        jdbc.sql("delete from folio_lines where id = ? and folio_id = ? and property_id = ?").params(lineId, folioId, TenantContext.require()).update();
        recompute(folioId);
        audit.record("folio_lines", lineId.toString(), "delete", line, Map.of("reason", reason, "approvedBy", String.valueOf(approvedBy)), userId);
        return load(folioId);
    }

    public record PaymentInput(String mode, long amountPaise, String reference, OffsetDateTime receivedAt, String reason, UUID clientUuid) {}

    /** Money received. Multiple partial payments are normal. {@code clientUuid} makes offline replays idempotent. */
    @Transactional
    public Folio recordPayment(UUID folioId, PaymentInput in, UUID userId) {
        if (in.amountPaise() <= 0) throw new BadRequestException("Amount must be positive");
        Settings s = settings.current();
        if (!s.paymentModes().contains(in.mode())) throw new BadRequestException("Payment mode not enabled: " + in.mode());
        Folio before = load(folioId);
        if (!"open".equals(before.status())) throw new ConflictException("Folio is " + before.status());
        if (in.clientUuid() != null) {
            boolean exists = !jdbc.sql("select id from payments where property_id = ? and client_uuid = ?").params(TenantContext.require(), in.clientUuid()).query(UUID.class).list().isEmpty();
            if (exists) return before;
        }
        UUID id = jdbc.sql("""
                insert into payments(property_id, folio_id, mode, amount_paise, reference, received_at, received_by, client_uuid)
                values (?, ?, ?::payment_mode, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), folioId, in.mode(), in.amountPaise(), nz(in.reference()), in.receivedAt() == null ? OffsetDateTime.now() : in.receivedAt(), userId, in.clientUuid())
                .query(UUID.class).single();
        recompute(folioId);
        audit.record("payments", id.toString(), "create", null, Map.of("mode", in.mode(), "amountPaise", in.amountPaise()), userId);
        return load(folioId);
    }

    /** Refund: negative payment with reason and approver; can never exceed what was paid. */
    @Transactional
    public Folio refund(UUID folioId, PaymentInput in, UUID userId, UUID approvedBy) {
        if (in.amountPaise() <= 0) throw new BadRequestException("Refund amount must be positive");
        if (in.reason() == null || in.reason().isBlank()) throw new BadRequestException("A reason is required for a refund");
        Folio before = load(folioId);
        if (in.amountPaise() > before.paidPaise()) throw new BadRequestException("Refund exceeds the amount paid");
        UUID id = jdbc.sql("""
                insert into payments(property_id, folio_id, mode, amount_paise, reference, is_refund, reason, received_at, received_by, approved_by, client_uuid)
                values (?, ?, ?::payment_mode, ?, ?, true, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), folioId, in.mode(), -in.amountPaise(), nz(in.reference()), in.reason(), in.receivedAt() == null ? OffsetDateTime.now() : in.receivedAt(), userId, approvedBy, in.clientUuid())
                .query(UUID.class).single();
        recompute(folioId);
        audit.record("payments", id.toString(), "refund", null, Map.of("mode", in.mode(), "amountPaise", -in.amountPaise(), "reason", in.reason()), userId);
        return load(folioId);
    }

    @Transactional
    public Folio setStatus(UUID folioId, String status, String reason, UUID userId, UUID approvedBy) {
        if (!Set.of("open", "settled", "written_off").contains(status)) throw new BadRequestException("Bad status");
        Folio before = load(folioId);
        if ("settled".equals(status) && before.balanceDuePaise() != 0) throw new ConflictException("Balance is not zero");
        if ("written_off".equals(status) && (reason == null || reason.isBlank())) throw new BadRequestException("A reason is required to write off");
        jdbc.sql("update folios set status = ?::folio_status, write_off_reason = ?, updated_at = now() where id = ? and property_id = ?")
                .params(status, "written_off".equals(status) ? reason : null, folioId, TenantContext.require()).update();
        audit.record("folios", folioId.toString(), "status", Map.of("status", before.status()), Map.of("status", status, "reason", nz(reason), "approvedBy", String.valueOf(approvedBy)), userId);
        return load(folioId);
    }

    // ---------- Internals ----------

    private static void requireReason(LineInput in) { if (in.reason() == null || in.reason().isBlank()) throw new BadRequestException("A reason is required for " + in.kind()); }

    private boolean hasGstin() {
        return jdbc.sql("select gstin is not null and gstin <> '' from properties where id = ?").param(TenantContext.require()).query(Boolean.class).single();
    }

    private UUID insertLine(UUID folioId, String kind, String description, int qty, long unitPaise, int bp, long cgst, long sgst, LocalDate date, boolean auto, String reason, UUID approvedBy, UUID userId) {
        return jdbc.sql("""
                insert into folio_lines(property_id, folio_id, kind, description, qty, unit_paise, tax_rate_bp, cgst_paise, sgst_paise, line_date, auto, reason, approved_by, created_by)
                values (?, ?, ?::folio_line_kind, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), folioId, kind, description, qty, unitPaise, bp, cgst, sgst, date, auto, reason, approvedBy, userId).query(UUID.class).single();
    }

    /** Recompute cached totals from lines and payments. Cheap, and it keeps the row honest. */
    public void recompute(UUID folioId) {
        jdbc.sql("""
                update folios f set
                  total_paise = coalesce((select sum(unit_paise * qty + cgst_paise + sgst_paise) from folio_lines l where l.folio_id = f.id and l.kind in ('room_charge','day_use','extra','discount','forfeit','adjustment')), 0),
                  tax_paise = coalesce((select sum(cgst_paise + sgst_paise) from folio_lines l where l.folio_id = f.id), 0),
                  deposit_held_paise = coalesce((select sum(unit_paise * qty) from folio_lines l where l.folio_id = f.id and l.kind in ('deposit','deposit_refund')), 0),
                  paid_paise = coalesce((select sum(amount_paise) from payments p where p.folio_id = f.id), 0),
                  updated_at = now()
                where f.id = ? and f.property_id = ?""").params(folioId, TenantContext.require()).update();
    }

    private Folio load(UUID folioId) {
        UUID p = TenantContext.require();
        List<Folio.Line> lines = jdbc.sql("select * from folio_lines where folio_id = ? and property_id = ? order by line_date, created_at").params(folioId, p).query((rs, i) -> new Folio.Line(
                rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("description"), rs.getInt("qty"), rs.getLong("unit_paise"), rs.getInt("tax_rate_bp"),
                rs.getLong("cgst_paise"), rs.getLong("sgst_paise"), rs.getObject("line_date", LocalDate.class), rs.getBoolean("auto"), rs.getString("reason"), rs.getObject("approved_by", UUID.class))).list();
        List<Folio.Payment> payments = jdbc.sql("select * from payments where folio_id = ? and property_id = ? order by received_at").params(folioId, p).query((rs, i) -> new Folio.Payment(
                rs.getObject("id", UUID.class), rs.getString("mode"), rs.getLong("amount_paise"), rs.getString("reference"), rs.getBoolean("is_refund"), rs.getString("reason"),
                rs.getObject("received_at", OffsetDateTime.class), rs.getObject("received_by", UUID.class), rs.getObject("approved_by", UUID.class))).list();
        return jdbc.sql("select * from folios where id = ? and property_id = ?").params(folioId, p).query((rs, i) -> new Folio(
                rs.getObject("id", UUID.class), rs.getObject("booking_id", UUID.class), rs.getString("status"), rs.getLong("total_paise"), rs.getLong("tax_paise"),
                rs.getLong("paid_paise"), rs.getLong("deposit_held_paise"), lines, payments)).optional().orElseThrow(() -> new NotFoundException("Folio"));
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }
}
