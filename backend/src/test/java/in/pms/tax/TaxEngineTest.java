package in.pms.tax;

import in.pms.settings.SettingsService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TaxEngineTest {
    @Test
    void slabBoundaryAtExactlySevenThousandFiveHundred() {
        var s = SettingsService.resolve(Map.of());
        assertThat(TaxEngine.rateBp(s, true, TaxRules.DEFAULT, 750000)).isEqualTo(500);
        assertThat(TaxEngine.rateBp(s, true, TaxRules.DEFAULT, 750001)).isEqualTo(1800);
    }

    @Test
    void noGstinOrExemptOrDonationMeansZero() {
        assertThat(TaxEngine.rateBp(SettingsService.resolve(Map.of()), false, TaxRules.DEFAULT, 100000)).isZero();
        assertThat(TaxEngine.rateBp(SettingsService.resolve(Map.of("tax_exempt", true)), true, TaxRules.DEFAULT, 100000)).isZero();
        assertThat(TaxEngine.rateBp(SettingsService.resolve(Map.of("donation_mode", true, "donation_mode_ca_confirmed", true)), true, TaxRules.DEFAULT, 100000)).isZero();
        // donation mode without CA confirmation does not switch tax off
        assertThat(TaxEngine.rateBp(SettingsService.resolve(Map.of("donation_mode", true)), true, TaxRules.DEFAULT, 100000)).isEqualTo(500);
    }

    @Test
    void religiousPrecinctExemptsBelowThresholdOnly() {
        var s = SettingsService.resolve(Map.of("religious_precinct", true, "exemption_threshold_paise", 100000));
        assertThat(TaxEngine.rateBp(s, true, TaxRules.DEFAULT, 99900)).isZero();
        assertThat(TaxEngine.rateBp(s, true, TaxRules.DEFAULT, 100000)).isEqualTo(500);
    }

    @Test
    void splitsEquallyIntoCgstAndSgstWithRounding() {
        var t = TaxEngine.on(100000, 500); // ₹1000 @ 5% = ₹50
        assertThat(t.cgstPaise()).isEqualTo(2500);
        assertThat(t.sgstPaise()).isEqualTo(2500);
        var odd = TaxEngine.on(101, 500); // 5.05 paise -> 5, split 2 + 3
        assertThat(odd.totalPaise()).isEqualTo(5);
        assertThat(odd.cgstPaise() + odd.sgstPaise()).isEqualTo(5);
    }

    @Test
    void aTaxInclusiveRateKeepsItsTotalAndTakesTheTaxOutOfIt() {
        var p = TaxEngine.price(105000, 1, 500, true, false); // ₹1050 including 5%
        assertThat(p.unitTaxablePaise()).isEqualTo(100000);
        assertThat(p.tax().totalPaise()).isEqualTo(5000);
        assertThat(p.totalPaise()).isEqualTo(105000);
        // An awkward amount still adds up to exactly what was quoted, whatever the rounding.
        var odd = TaxEngine.price(99999, 3, 1800, true, false);
        assertThat(odd.totalPaise()).isEqualTo(99999L * 3);
        assertThat(odd.tax().cgstPaise() + odd.tax().sgstPaise()).isEqualTo(odd.tax().totalPaise());
        // Exclusive pricing is the old arithmetic.
        assertThat(TaxEngine.price(100000, 2, 500, false, false).totalPaise()).isEqualTo(210000);
    }

    @Test
    void anInclusiveRateIsSlabbedOnItsTaxableValue() {
        var s = SettingsService.resolve(Map.of());
        // ₹7,875 gross is ₹7,500 taxable at 5%: still the lower slab. ₹7,900 is over it at 5%, so 18%.
        assertThat(TaxEngine.rateBpInclusive(s, true, TaxRules.DEFAULT, 787500)).isEqualTo(500);
        assertThat(TaxEngine.rateBpInclusive(s, true, TaxRules.DEFAULT, 790000)).isEqualTo(1800);
        assertThat(TaxEngine.rateBpInclusive(s, false, TaxRules.DEFAULT, 790000)).isZero();
    }

    @Test
    void igstOnlyWhenAskedForAndTheCompanyIsInAnotherState() {
        var off = SettingsService.resolve(Map.of());
        var on = SettingsService.resolve(Map.of("igst_for_interstate_b2b", true));
        assertThat(TaxEngine.interstate(off, "09AAACH7409R1ZZ", "27AAACH7409R1ZZ")).isFalse();
        assertThat(TaxEngine.interstate(on, "09AAACH7409R1ZZ", "27AAACH7409R1ZZ")).isTrue();
        assertThat(TaxEngine.interstate(on, "09AAACH7409R1ZZ", "09BBBCH7409R1ZZ")).isFalse();
        assertThat(TaxEngine.interstate(on, "09AAACH7409R1ZZ", null)).isFalse();
        var igst = TaxEngine.price(100000, 1, 1800, false, true).tax();
        assertThat(igst.igstPaise()).isEqualTo(18000);
        assertThat(igst.cgstPaise() + igst.sgstPaise()).isZero();
    }
}
