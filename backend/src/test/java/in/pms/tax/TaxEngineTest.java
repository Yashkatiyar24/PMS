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
}
