package in.pms.folio;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.audit.AuditService;
import in.pms.charges.ReceiptNumberFormat;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.money.FinancialYear;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
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
 * Issues receipts (PRD F4, F5, F6). A receipt is an immutable snapshot with a gap-free number per property,
 * financial year and kind, allocated with a row lock inside the issuing transaction. Corrections after issue are
 * credit notes that reference the invoice; nothing is ever edited or voided.
 *
 * <ul>
 *   <li><b>provisional</b>: receipt for money received (advance at check-in); not a tax invoice</li>
 *   <li><b>invoice</b>: the tax invoice for the stay, issued at checkout</li>
 *   <li><b>donation</b>: used instead of an invoice when donation mode is on (80G)</li>
 *   <li><b>credit_note</b>: reduces an issued invoice</li>
 * </ul>
 */
@Service
public class ReceiptService {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final AuditService audit;
    private final SettingsService settings;
    private final FolioService folios;

    public ReceiptService(@Qualifier("jdbc") JdbcClient jdbc, ObjectMapper json, AuditService audit, SettingsService settings, FolioService folios) {
        this.jdbc = jdbc; this.json = json; this.audit = audit; this.settings = settings; this.folios = folios;
    }

    public record Receipt(UUID id, UUID folioId, String kind, String number, String fy, long amountPaise, Map<String, Object> snapshot, UUID referencesReceiptId, OffsetDateTime issuedAt, String pdfKey) {}

    @Transactional(readOnly = true)
    public List<Receipt> forFolio(UUID folioId) {
        return jdbc.sql("select *, snapshot::text as snap from receipts where folio_id = ? and property_id = ? order by issued_at").params(folioId, TenantContext.require()).query(this::map).list();
    }

    @Transactional(readOnly = true)
    public Receipt get(UUID id) {
        return jdbc.sql("select *, snapshot::text as snap from receipts where id = ? and property_id = ?").params(id, TenantContext.require()).query(this::map).optional().orElseThrow(() -> new NotFoundException("Receipt"));
    }

    /** Issue the stay's invoice (or donation receipt in donation mode). */
    @Transactional
    public Receipt issueInvoice(UUID folioId, UUID userId) {
        Settings s = settings.current();
        String kind = s.donationMode() ? "donation" : "invoice";
        Folio f = folios.get(folioId);
        return issue(f, kind, f.totalPaise(), null, userId, s);
    }

    /** Receipt for money received right now (e.g. an advance). Amount is what was just paid. */
    @Transactional
    public Receipt issueProvisional(UUID folioId, long amountPaise, UUID userId) {
        if (amountPaise <= 0) throw new BadRequestException("Amount must be positive");
        Folio f = folios.get(folioId);
        return issue(f, "provisional", amountPaise, null, userId, settings.current());
    }

    /** Reduce an issued invoice. The amount cannot exceed what the invoice and earlier credit notes leave. */
    @Transactional
    public Receipt creditNote(UUID invoiceId, long amountPaise, String reason, UUID userId, UUID approvedBy) {
        Receipt inv = get(invoiceId);
        if (!"invoice".equals(inv.kind()) && !"donation".equals(inv.kind())) throw new BadRequestException("Credit notes reference an invoice");
        if (amountPaise <= 0 || reason == null || reason.isBlank()) throw new BadRequestException("Amount and reason are required");
        long credited = jdbc.sql("select coalesce(sum(amount_paise), 0) from receipts where references_receipt_id = ? and property_id = ?").params(invoiceId, TenantContext.require()).query(Long.class).single();
        if (amountPaise > inv.amountPaise() - credited) throw new BadRequestException("Credit exceeds the remaining invoice amount");
        Folio f = folios.get(inv.folioId());
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("reason", reason); extra.put("againstNumber", inv.number()); extra.put("approvedBy", String.valueOf(approvedBy));
        return issue(f, "credit_note", amountPaise, invoiceId, userId, settings.current(), extra);
    }

    private Receipt issue(Folio f, String kind, long amountPaise, UUID references, UUID userId, Settings s) { return issue(f, kind, amountPaise, references, userId, s, Map.of()); }

    private Receipt issue(Folio f, String kind, long amountPaise, UUID references, UUID userId, Settings s, Map<String, Object> extra) {
        UUID property = TenantContext.require();
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(property).query(String.class).single());
        LocalDate today = LocalDate.now(zone);
        String fy = FinancialYear.of(today);

        // Gap-free number: lock the counter row for this (property, fy, kind) and take the next value.
        jdbc.sql("insert into receipt_counters(property_id, fy, kind, last) values (?, ?, ?::receipt_kind, 0) on conflict do nothing").params(property, fy, kind).update();
        int seq = jdbc.sql("update receipt_counters set last = last + 1 where property_id = ? and fy = ? and kind = ?::receipt_kind returning last").params(property, fy, kind).query(Integer.class).single();
        String prefix = s.receiptPrefix() + switch (kind) { case "credit_note" -> "CN"; case "provisional" -> "R"; case "donation" -> "D"; default -> ""; };
        String number = ReceiptNumberFormat.format(s.receiptNumberFormat(), prefix, fy, seq);

        Map<String, Object> snapshot = snapshot(f, kind, number, fy, amountPaise, today, s);
        snapshot.putAll(extra);
        UUID id;
        try {
            id = jdbc.sql("insert into receipts(property_id, folio_id, kind, number, fy, snapshot, amount_paise, references_receipt_id, issued_by) values (?, ?, ?::receipt_kind, ?, ?, ?::jsonb, ?, ?, ?) returning id")
                    .params(property, f.id(), kind, number, fy, json.writeValueAsString(snapshot), amountPaise, references, userId).query(UUID.class).single();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
        audit.record("receipts", id.toString(), "issue", null, Map.of("kind", kind, "number", number, "amountPaise", amountPaise), userId);
        return get(id);
    }

    /** Everything the printed document needs, captured now so a re-print years later is identical. */
    private Map<String, Object> snapshot(Folio f, String kind, String number, String fy, long amountPaise, LocalDate date, Settings s) {
        UUID property = TenantContext.require();
        var prop = jdbc.sql("select name, address, city, state, phone, email, gstin, trust_reg_no, reg_80g from properties where id = ?").param(property).query().listOfRows().get(0);
        var guest = jdbc.sql("""
                select g.name, g.phone, g.city, g.address, g.nationality, g.id_type::text as id_type, g.id_last4, b.arrive_at, b.depart_at, b.adults, b.children, b.member_count,
                       (select string_agg(coalesce(r.number, '') || case when bu.bed_id is not null then '/' || bd.label else '' end, ', ')
                          from booking_units bu join rooms r on r.id = bu.room_id left join beds bd on bd.id = bu.bed_id where bu.booking_id = b.id and bu.cancelled_at is null) as units
                from bookings b join guests g on g.id = b.guest_id where b.id = ?""").param(f.bookingId()).query().listOfRows().get(0);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kind", kind); m.put("number", number); m.put("fy", fy); m.put("date", date.toString()); m.put("amountPaise", amountPaise);
        m.put("property", prop); m.put("guest", guest);
        m.put("lines", f.lines().stream().map(l -> Map.of("kind", l.kind(), "description", l.description(), "qty", l.qty(), "unitPaise", l.unitPaise(),
                "amountPaise", l.amountPaise(), "taxRateBp", l.taxRateBp(), "cgstPaise", l.cgstPaise(), "sgstPaise", l.sgstPaise(), "date", l.lineDate().toString())).toList());
        m.put("payments", f.payments().stream().map(p -> Map.of("mode", p.mode(), "amountPaise", p.amountPaise(), "reference", p.reference(), "receivedAt", p.receivedAt().toString())).toList());
        m.put("totals", Map.of("totalPaise", f.totalPaise(), "taxPaise", f.taxPaise(), "paidPaise", f.paidPaise(), "depositHeldPaise", f.depositHeldPaise(), "balanceDuePaise", f.balanceDuePaise()));
        // Tax breakup by rate for the invoice footer and GSTR-1
        Map<Integer, long[]> byRate = new TreeMap<>();
        for (var l : f.lines()) if (l.taxRateBp() > 0) { long[] acc = byRate.computeIfAbsent(l.taxRateBp(), k -> new long[3]); acc[0] += l.amountPaise(); acc[1] += l.cgstPaise(); acc[2] += l.sgstPaise(); }
        m.put("taxBreakup", byRate.entrySet().stream().map(e -> Map.of("rateBp", e.getKey(), "taxablePaise", e.getValue()[0], "cgstPaise", e.getValue()[1], "sgstPaise", e.getValue()[2])).toList());
        m.put("template", Map.of("header", s.receiptHeader(), "footer", s.receiptFooter(), "terms", s.receiptTerms(), "logoKey", s.receiptLogoKey(), "upiVpa", s.upiVpa(), "upiPayeeName", s.upiPayeeName(), "language", s.guestLanguage()));
        m.put("hsn", "9963");
        return m;
    }

    private Receipt map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        Map<String, Object> snap;
        try { snap = json.readValue(rs.getString("snap"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { throw new java.sql.SQLException("Corrupt receipt snapshot", e); }
        return new Receipt(rs.getObject("id", UUID.class), rs.getObject("folio_id", UUID.class), rs.getString("kind"), rs.getString("number"), rs.getString("fy"),
                rs.getLong("amount_paise"), snap, rs.getObject("references_receipt_id", UUID.class), rs.getObject("issued_at", OffsetDateTime.class), rs.getString("pdf_key"));
    }
}
