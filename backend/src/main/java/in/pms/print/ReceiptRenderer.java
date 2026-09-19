package in.pms.print;

import in.pms.audit.AuditService;
import in.pms.folio.ReceiptService;
import in.pms.integrations.pdf.PdfRenderer;
import in.pms.integrations.storage.StorageProvider;
import in.pms.money.Money;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.io.ByteArrayInputStream;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Turns a receipt's stored snapshot into printable HTML, and the same HTML into a PDF.
 *
 * <p>Nothing is read from live tables: the snapshot taken at issue time is the only source, so a reprint
 * years later is byte-identical even if rates, settings or the guest record have changed since.
 */
@Service
public class ReceiptRenderer {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm");

    /** Page geometry per printer profile (PRD F9). 58 mm and 80 mm are thermal rolls; A4 is the office printer. */
    private record Page(String size, String margin, String font) {}
    private static final Map<String, Page> PAGES = Map.of(
            "thermal_58", new Page("58mm 200mm", "2mm", "8pt"),
            "thermal_80", new Page("80mm 200mm", "3mm", "9pt"),
            "a4", new Page("A4", "12mm", "10pt"));

    private final TemplateEngine templates;
    private final PdfRenderer pdf;
    private final StorageProvider storage;
    private final ReceiptService receipts;
    private final SettingsService settings;
    private final AuditService audit;
    private final JdbcClient jdbc;

    public ReceiptRenderer(TemplateEngine templates, PdfRenderer pdf, StorageProvider storage, ReceiptService receipts,
                           SettingsService settings, AuditService audit, @Qualifier("jdbc") JdbcClient jdbc) {
        this.templates = templates; this.pdf = pdf; this.storage = storage; this.receipts = receipts;
        this.settings = settings; this.audit = audit; this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public String html(UUID receiptId, String profileOverride) {
        var receipt = receipts.get(receiptId);
        String profile = profileOverride != null && PAGES.containsKey(profileOverride) ? profileOverride : settings.current().printerProfile();
        return render(receipt, profile);
    }

    /** Render, store the PDF once, and return the bytes. The key is kept on the receipt for WhatsApp sends. */
    @Transactional
    public byte[] pdf(UUID receiptId, String profileOverride, UUID userId) {
        var receipt = receipts.get(receiptId);
        String profile = profileOverride != null && PAGES.containsKey(profileOverride) ? profileOverride : settings.current().printerProfile();
        byte[] bytes = pdf.render(render(receipt, profile), null);
        String key = TenantContext.require() + "/receipts/" + receipt.fy() + "/" + receipt.id() + "-" + profile + ".pdf";
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, "application/pdf");
        jdbc.sql("update receipts set pdf_key = ? where id = ? and property_id = ? and pdf_key is null").params(key, receiptId, TenantContext.require()).update();
        audit.record("receipts", receiptId.toString(), "print", null, Map.of("profile", profile), userId);
        return bytes;
    }

    /** The storage key of the PDF, rendering it first if this is the first time. */
    @Transactional
    public String pdfKey(UUID receiptId, UUID userId) {
        var receipt = receipts.get(receiptId);
        if (receipt.pdfKey() != null) return receipt.pdfKey();
        pdf(receiptId, null, userId);
        return receipts.get(receiptId).pdfKey();
    }

    @SuppressWarnings("unchecked")
    private String render(ReceiptService.Receipt receipt, String profile) {
        Map<String, Object> snap = receipt.snapshot();
        Map<String, Object> property = (Map<String, Object>) snap.get("property");
        Map<String, Object> guest = (Map<String, Object>) snap.get("guest");
        Map<String, Object> template = (Map<String, Object>) snap.get("template");
        Map<String, Object> totals = (Map<String, Object>) snap.get("totals");
        String language = String.valueOf(template.getOrDefault("language", "hi"));
        ZoneId zone = ZoneId.of(String.valueOf(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single()));

        Context ctx = new Context(Locale.forLanguageTag(language));
        ctx.setVariable("language", language);
        ctx.setVariable("labels", Labels.all(language));
        ctx.setVariable("page", PAGES.getOrDefault(profile, PAGES.get("a4")));
        ctx.setVariable("property", property);
        ctx.setVariable("guest", guest);
        ctx.setVariable("template", template);
        ctx.setVariable("hsn", snap.getOrDefault("hsn", "9963"));

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("kind", receipt.kind());
        r.put("number", receipt.number());
        r.put("date", DATE.format(java.time.LocalDate.parse(String.valueOf(snap.get("date")))));
        r.put("againstNumber", snap.get("againstNumber"));
        r.put("reason", snap.get("reason"));
        ctx.setVariable("r", r);

        ctx.setVariable("stayFrom", fmt(guest.get("arrive_at"), zone, DATE_TIME));
        ctx.setVariable("stayTo", fmt(guest.get("depart_at"), zone, DATE_TIME));

        // A credit note prints only its own amount; other receipts print the folio's lines.
        List<Map<String, Object>> lines = new ArrayList<>();
        if ("credit_note".equals(receipt.kind())) {
            lines.add(Map.of("description", Labels.bilingual("credit_note", language), "qty", 1,
                    "rate", Money.format(receipt.amountPaise()), "amount", Money.format(receipt.amountPaise())));
        } else {
            for (Map<String, Object> l : (List<Map<String, Object>>) snap.getOrDefault("lines", List.of())) {
                if ("deposit".equals(l.get("kind")) || "deposit_refund".equals(l.get("kind"))) continue; // shown in totals
                lines.add(Map.of("description", String.valueOf(l.get("description")), "qty", l.get("qty"),
                        "rate", Money.format(num(l.get("unitPaise"))), "amount", Money.format(num(l.get("amountPaise")))));
            }
        }
        ctx.setVariable("lines", lines);

        List<Map<String, Object>> tax = new ArrayList<>();
        boolean igst = false;
        for (Map<String, Object> t : (List<Map<String, Object>>) snap.getOrDefault("taxBreakup", List.of())) {
            // Snapshots issued before IGST existed have no igstPaise: zero, and they print exactly as before.
            igst |= num(t.get("igstPaise")) != 0;
            tax.add(Map.of("rate", (num(t.get("rateBp")) / 100.0) + "%", "taxable", Money.format(num(t.get("taxablePaise"))),
                    "cgst", Money.format(num(t.get("cgstPaise"))), "sgst", Money.format(num(t.get("sgstPaise"))), "igst", Money.format(num(t.get("igstPaise")))));
        }
        ctx.setVariable("taxBreakup", tax);
        ctx.setVariable("igst", igst);

        long deposit = num(totals.get("depositHeldPaise"));
        ctx.setVariable("totals", Map.of(
                "total", Money.format("credit_note".equals(receipt.kind()) ? receipt.amountPaise() : num(totals.get("totalPaise"))),
                "paid", Money.format(num(totals.get("paidPaise"))),
                "deposit", Money.format(deposit), "showDeposit", deposit != 0,
                "balance", Money.format(num(totals.get("balanceDuePaise")))));

        List<Map<String, Object>> payments = new ArrayList<>();
        for (Map<String, Object> p : (List<Map<String, Object>>) snap.getOrDefault("payments", List.of()))
            payments.add(Map.of("at", fmt(p.get("receivedAt"), zone, DATE_TIME), "mode", String.valueOf(p.get("mode")),
                    "reference", String.valueOf(p.getOrDefault("reference", "")), "amount", Money.format(num(p.get("amountPaise")))));
        ctx.setVariable("payments", payments);

        long due = num(totals.get("balanceDuePaise"));
        ctx.setVariable("qr", due > 0 ? UpiQr.dataUri(String.valueOf(template.getOrDefault("upiVpa", "")),
                String.valueOf(template.getOrDefault("upiPayeeName", "")), due, receipt.number(), 220) : null);

        return templates.process("receipt", ctx);
    }

    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0L; }

    private static String fmt(Object iso, ZoneId zone, DateTimeFormatter f) {
        if (iso == null) return "";
        try { return f.format(OffsetDateTime.parse(String.valueOf(iso)).atZoneSameInstant(zone)); }
        catch (Exception e) { return String.valueOf(iso); }
    }
}
