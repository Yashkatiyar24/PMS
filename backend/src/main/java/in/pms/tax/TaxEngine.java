package in.pms.tax;

import in.pms.money.Money;
import in.pms.settings.Settings;

/**
 * Decides the GST on one room-charge line. Pure function of (settings, rules in force, unit rate).
 *
 * <p>Rules, in order:
 * <ol>
 *   <li>No GSTIN, {@code tax_exempt}, or donation mode: 0%.</li>
 *   <li>{@code religious_precinct} and the per-day rate is below {@code exemption_threshold_paise}: 0%
 *       (charitable-trust precinct exemption; the threshold is a setting because the law can change).</li>
 *   <li>Otherwise the slab for the per-day rate from the effective-dated {@link TaxRules}.</li>
 * </ol>
 * The rate is split equally into CGST and SGST because accommodation is always an intra-state supply.
 */
public final class TaxEngine {
    private TaxEngine() {}

    public record Tax(int rateBp, long cgstPaise, long sgstPaise) {
        public long totalPaise() { return cgstPaise + sgstPaise; }
        public static final Tax NONE = new Tax(0, 0, 0);
    }

    public static int rateBp(Settings s, boolean hasGstin, TaxRules rules, long ratePerDayPaise) {
        if (!hasGstin || s.taxExempt() || s.donationMode()) return 0;
        if (s.religiousPrecinct() && ratePerDayPaise < s.exemptionThresholdPaise()) return 0;
        return rules.rateBpFor(ratePerDayPaise);
    }

    /** Tax on a line amount, given the per-day rate that decides the slab. */
    public static Tax on(long lineAmountPaise, int rateBp) {
        if (rateBp == 0 || lineAmountPaise == 0) return Tax.NONE;
        long total = Money.percentBp(lineAmountPaise, rateBp);
        long cgst = total / 2;
        return new Tax(rateBp, cgst, total - cgst);
    }
}
