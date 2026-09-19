package in.pms.tax;

import in.pms.money.Money;
import in.pms.settings.Settings;

/**
 * Decides the GST on one line. Pure function of (settings, rules in force, the per-day rate, the amount); every
 * place that charges tax goes through here, so there is one answer to "how much GST is on this?".
 *
 * <p>Rate, in order:
 * <ol>
 *   <li>No GSTIN, {@code tax_exempt}, or donation mode: 0%.</li>
 *   <li>{@code religious_precinct} and the per-day rate is below {@code exemption_threshold_paise}: 0%
 *       (charitable-trust precinct exemption; the threshold is a setting because the law can change).</li>
 *   <li>Otherwise the slab for the per-day rate from the effective-dated {@link TaxRules}.</li>
 * </ol>
 *
 * <p>Split: CGST and SGST in equal halves, because accommodation is an intra-state supply (its place of supply
 * is where the property is). IGST instead only when the property turns on {@code igst_for_interstate_b2b} and
 * bills a company registered in another state.
 *
 * <p>Pricing: with {@code rates_include_tax} the rate the guest is quoted already contains the GST, so the
 * taxable value is taken out of it and the total stays exactly what was quoted. The slab is decided on that
 * taxable value, as the law decides it on the value of supply.
 */
public final class TaxEngine {
    private TaxEngine() {}

    public record Tax(int rateBp, long cgstPaise, long sgstPaise, long igstPaise) {
        public Tax(int rateBp, long cgstPaise, long sgstPaise) { this(rateBp, cgstPaise, sgstPaise, 0); }
        public long totalPaise() { return cgstPaise + sgstPaise + igstPaise; }
        public static final Tax NONE = new Tax(0, 0, 0, 0);
    }

    /** A priced line: the taxable value per unit (what the folio stores) and the tax on the whole line. */
    public record Priced(long unitTaxablePaise, int qty, Tax tax) {
        public long taxablePaise() { return unitTaxablePaise * qty; }
        public long totalPaise() { return taxablePaise() + tax.totalPaise(); }
    }

    /** The rate for a tax-exclusive per-day rate. */
    public static int rateBp(Settings s, boolean hasGstin, TaxRules rules, long ratePerDayPaise) {
        if (!hasGstin || s.taxExempt() || s.donationMode()) return 0;
        if (s.religiousPrecinct() && ratePerDayPaise < s.exemptionThresholdPaise()) return 0;
        return rules.rateBpFor(ratePerDayPaise);
    }

    /** Food and drink: one configured rate, and none when the property charges no GST at all. */
    public static int restaurantRateBp(Settings s, boolean hasGstin) {
        if (!hasGstin || s.taxExempt() || s.donationMode()) return 0;
        return s.restaurantTaxBp();
    }

    /** The rate for a per-day rate that already includes GST: the first slab its taxable value falls in. */
    public static int rateBpInclusive(Settings s, boolean hasGstin, TaxRules rules, long grossPerDayPaise) {
        if (!hasGstin || s.taxExempt() || s.donationMode()) return 0;
        if (s.religiousPrecinct() && grossPerDayPaise < s.exemptionThresholdPaise()) return 0;
        for (TaxRules.Slab slab : rules.slabs())
            if (slab.uptoPaise() == null || taxableFromInclusive(grossPerDayPaise, slab.bp()) <= slab.uptoPaise()) return slab.bp();
        return 0;
    }

    /** The taxable value inside a GST-inclusive amount, rounded half up: 1050 at 5% is 1000. */
    public static long taxableFromInclusive(long grossPaise, int rateBp) {
        return Math.floorDiv(grossPaise * 10000 + (10000 + rateBp) / 2, 10000 + rateBp);
    }

    /** Tax on a tax-exclusive line amount, split CGST/SGST. */
    public static Tax on(long lineAmountPaise, int rateBp) { return split(lineAmountPaise == 0 ? 0 : Money.percentBp(lineAmountPaise, rateBp), rateBp, false); }

    /** Tax of {@code taxPaise} at {@code rateBp}, as CGST/SGST halves or as IGST. */
    public static Tax split(long taxPaise, int rateBp, boolean interstate) {
        if (rateBp == 0 || taxPaise == 0) return Tax.NONE;
        if (interstate) return new Tax(rateBp, 0, 0, taxPaise);
        long cgst = taxPaise / 2;
        return new Tax(rateBp, cgst, taxPaise - cgst, 0);
    }

    /**
     * Price one line. {@code unitPaise} is what the desk or the rate card says one unit costs; when
     * {@code inclusive} it already contains the tax, and the line's total comes out as exactly {@code unitPaise * qty}.
     */
    public static Priced price(long unitPaise, int qty, int rateBp, boolean inclusive, boolean interstate) {
        if (rateBp == 0) return new Priced(unitPaise, qty, Tax.NONE);
        if (!inclusive) {
            long tax = unitPaise * qty == 0 ? 0 : Money.percentBp(unitPaise * qty, rateBp);
            return new Priced(unitPaise, qty, split(tax, rateBp, interstate));
        }
        long unitTaxable = taxableFromInclusive(unitPaise, rateBp);
        return new Priced(unitTaxable, qty, split(unitPaise * qty - unitTaxable * qty, rateBp, interstate));
    }

    /**
     * IGST applies only when the property asks for it and bills a company registered in another state: the
     * first two characters of a GSTIN are the state code.
     */
    public static boolean interstate(Settings s, String propertyGstin, String billingGstin) {
        return s.igstForInterstateB2b() && propertyGstin != null && billingGstin != null && propertyGstin.length() >= 2 && billingGstin.length() >= 2
                && !propertyGstin.substring(0, 2).equals(billingGstin.substring(0, 2));
    }
}
