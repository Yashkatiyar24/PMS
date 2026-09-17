package in.pms.tax;

import java.util.List;

/**
 * Effective-dated GST slabs stored as JSON in {@code tax_rules.rules}.
 * Slabs are checked in order; a slab without {@code uptoPaise} is the catch-all.
 * Example: {@code [{"uptoPaise":750000,"bp":500},{"bp":1800}]} = 5% up to ₹7,500/day, 18% above.
 */
public record TaxRules(List<Slab> slabs, String note) {
    public record Slab(Long uptoPaise, int bp) {}

    public static final TaxRules DEFAULT = new TaxRules(List.of(new Slab(750000L, 500), new Slab(null, 1800)), "default");

    public int rateBpFor(long ratePerDayPaise) {
        for (Slab s : slabs) if (s.uptoPaise() == null || ratePerDayPaise <= s.uptoPaise()) return s.bp();
        return 0;
    }
}
