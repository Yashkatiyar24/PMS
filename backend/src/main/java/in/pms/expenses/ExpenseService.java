package in.pms.expenses;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.integrations.storage.StorageProvider;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

/** Money out. Recorded with a category and, ideally, a photo of the bill; voided with a reason, never deleted. */
@Service
public class ExpenseService {
    public static final List<String> CATEGORIES = List.of("utilities", "maintenance", "salaries", "cleaning", "supplies", "food", "marketing", "other");
    private static final Set<String> MODES = Set.of("cash", "upi", "card", "bank", "cheque");
    private static final Set<String> RECEIPT_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "application/pdf");

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final StorageProvider storage;

    public ExpenseService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, StorageProvider storage) { this.jdbc = jdbc; this.audit = audit; this.storage = storage; }

    public record Expense(UUID id, LocalDate spentOn, String category, long amountPaise, String vendor, String paymentMode, String description,
                          boolean hasReceipt, OffsetDateTime voidedAt, String voidReason, String createdByName, OffsetDateTime createdAt) {}
    public record ExpenseInput(LocalDate spentOn, String category, long amountPaise, String vendor, String paymentMode, String description) {}
    public record Summary(LocalDate from, LocalDate to, long totalPaise, Map<String, Long> byCategory, List<Expense> expenses) {}

    @Transactional(readOnly = true)
    public Summary list(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw new BadRequestException("Check the dates");
        List<Expense> list = jdbc.sql("""
                select e.*, u.name as created_by_name from expenses e left join users u on u.id = e.created_by
                where e.property_id = ? and e.spent_on between ? and ? order by e.spent_on desc, e.created_at desc limit 1000""")
                .params(TenantContext.require(), from, to).query(this::map).list();
        Map<String, Long> byCategory = new LinkedHashMap<>();
        for (String c : CATEGORIES) byCategory.put(c, 0L);
        long total = 0;
        for (Expense e : list) if (e.voidedAt() == null) { byCategory.merge(e.category(), e.amountPaise(), Long::sum); total += e.amountPaise(); }
        return new Summary(from, to, total, byCategory, list);
    }

    @Transactional
    public Expense create(ExpenseInput in, UUID userId) {
        if (in.spentOn() == null) throw new BadRequestException("Say when it was spent");
        if (!CATEGORIES.contains(in.category())) throw new BadRequestException("Category must be one of " + CATEGORIES);
        if (in.amountPaise() <= 0) throw new BadRequestException("Amount must be positive");
        String mode = in.paymentMode() == null || in.paymentMode().isBlank() ? "cash" : in.paymentMode();
        if (!MODES.contains(mode)) throw new BadRequestException("Payment mode must be one of " + MODES);
        UUID id = jdbc.sql("""
                insert into expenses(property_id, spent_on, category, amount_paise, vendor, payment_mode, description, created_by)
                values (?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), in.spentOn(), in.category(), in.amountPaise(), clip(in.vendor(), 200), mode, clip(in.description(), 1000), userId)
                .query(UUID.class).single();
        Expense e = get(id);
        audit.record("expenses", id.toString(), "create", null, e, userId);
        return e;
    }

    /** An expense entered by mistake is voided with a reason; it stays on the list, struck through, and out of the totals. */
    @Transactional
    public Expense voidExpense(UUID id, String reason, UUID userId) {
        if (reason == null || reason.isBlank()) throw new BadRequestException("A reason is required");
        Expense before = get(id);
        if (before.voidedAt() != null) throw new BadRequestException("Already voided");
        jdbc.sql("update expenses set voided_at = now(), void_reason = ? where id = ? and property_id = ?").params(clip(reason, 300), id, TenantContext.require()).update();
        audit.record("expenses", id.toString(), "void", before, Map.of("reason", reason), userId);
        return get(id);
    }

    @Transactional
    public Expense storeReceipt(UUID id, InputStream data, long length, String contentType, UUID userId) {
        if (!RECEIPT_TYPES.contains(contentType)) throw new BadRequestException("The bill must be a photo (JPEG, PNG, WebP) or a PDF");
        if (length > 5L * 1024 * 1024) throw new BadRequestException("The file is too large (5 MB at most)");
        get(id);
        String ext = switch (contentType) { case "image/png" -> "png"; case "image/webp" -> "webp"; case "application/pdf" -> "pdf"; default -> "jpg"; };
        String key = TenantContext.require() + "/expense-bills/" + id + "-" + UUID.randomUUID() + "." + ext;
        storage.put(key, data, length, contentType);
        jdbc.sql("update expenses set receipt_key = ? where id = ? and property_id = ?").params(key, id, TenantContext.require()).update();
        audit.record("expenses", id.toString(), "receipt", null, null, userId);
        return get(id);
    }

    @Transactional(readOnly = true)
    public String receiptUrl(UUID id) {
        String key = jdbc.sql("select receipt_key from expenses where id = ? and property_id = ?").params(id, TenantContext.require()).query(String.class).optional().orElse(null);
        if (key == null) throw new NotFoundException("Bill");
        return storage.signedGetUrl(key, Duration.ofMinutes(5));
    }

    private Expense get(UUID id) {
        return jdbc.sql("select e.*, u.name as created_by_name from expenses e left join users u on u.id = e.created_by where e.id = ? and e.property_id = ?")
                .params(id, TenantContext.require()).query(this::map).optional().orElseThrow(() -> new NotFoundException("Expense"));
    }

    private Expense map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Expense(rs.getObject("id", UUID.class), rs.getObject("spent_on", LocalDate.class), rs.getString("category"), rs.getLong("amount_paise"),
                rs.getString("vendor"), rs.getString("payment_mode"), rs.getString("description"), rs.getString("receipt_key") != null,
                rs.getObject("voided_at", OffsetDateTime.class), rs.getString("void_reason"), rs.getString("created_by_name"), rs.getObject("created_at", OffsetDateTime.class));
    }

    private static String clip(String s, int max) { String v = s == null ? "" : s.trim(); return v.length() > max ? v.substring(0, max) : v; }
}
