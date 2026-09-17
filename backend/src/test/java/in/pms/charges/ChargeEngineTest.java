package in.pms.charges;

import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ChargeEngineTest {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    static Settings settings(Map<String, Object> overrides) { return SettingsService.resolve(overrides); }

    static ChargeEngine.Stay stay(String arrive, String depart) {
        return new ChargeEngine.Stay(OffsetDateTime.parse(arrive), OffsetDateTime.parse(depart), 100000, "101", IST);
    }

    @Test
    void nightMode_twoNights() {
        var lines = ChargeEngine.compute(stay("2026-10-01T12:00+05:30", "2026-10-03T09:00+05:30"), settings(Map.of()));
        assertThat(lines).hasSize(2).allMatch(l -> l.kind() == StayCharge.Kind.ROOM_CHARGE && l.unitPaise() == 100000);
    }

    @Test
    void nightMode_sameDayIsDayUseAtConfiguredPercent() {
        var lines = ChargeEngine.compute(stay("2026-10-01T04:00+05:30", "2026-10-01T18:00+05:30"), settings(Map.of("day_use_rate_pct", 60)));
        assertThat(lines).singleElement().satisfies(l -> { assertThat(l.kind()).isEqualTo(StayCharge.Kind.DAY_USE); assertThat(l.unitPaise()).isEqualTo(60000); });
    }

    @Test
    void nightMode_sameDayWithoutDayUseIsOneNight() {
        var lines = ChargeEngine.compute(stay("2026-10-01T04:00+05:30", "2026-10-01T18:00+05:30"), settings(Map.of("day_use_allowed", false)));
        assertThat(lines).singleElement().satisfies(l -> assertThat(l.kind()).isEqualTo(StayCharge.Kind.ROOM_CHARGE));
    }

    @Test
    void nightMode_lateCheckoutBeyondGraceAddsHalfDay() {
        var lines = ChargeEngine.compute(stay("2026-10-01T02:00+05:30", "2026-10-02T23:00+05:30"), settings(Map.of()));
        assertThat(lines).extracting(StayCharge::kind).containsExactly(StayCharge.Kind.ROOM_CHARGE, StayCharge.Kind.LATE_CHECKOUT);
        assertThat(lines.get(1).unitPaise()).isEqualTo(50000);
    }

    @Test
    void nightMode_withinGraceNoLateCharge() {
        var lines = ChargeEngine.compute(stay("2026-10-01T12:00+05:30", "2026-10-02T10:45+05:30"), settings(Map.of()));
        assertThat(lines).hasSize(1);
    }

    @Test
    void mode24h_arrive2amLeave11pmNextDayIsTwoPeriods() {
        var lines = ChargeEngine.compute(stay("2026-10-01T02:00+05:30", "2026-10-02T23:00+05:30"), settings(Map.of("billing_mode", "24h")));
        assertThat(lines).hasSize(2);
    }

    @Test
    void mode24h_graceKeepsItToOnePeriod() {
        var lines = ChargeEngine.compute(stay("2026-10-01T12:00+05:30", "2026-10-02T12:45+05:30"), settings(Map.of("billing_mode", "24h")));
        assertThat(lines).hasSize(1);
    }

    @Test
    void mode24h_sameDayShortStayIsDayUse() {
        var lines = ChargeEngine.compute(stay("2026-10-01T04:00+05:30", "2026-10-01T18:00+05:30"), settings(Map.of("billing_mode", "24h")));
        assertThat(lines).singleElement().satisfies(l -> assertThat(l.kind()).isEqualTo(StayCharge.Kind.DAY_USE));
    }

    @Test
    void receiptNumberFormatting() {
        assertThat(ReceiptNumberFormat.format("{PREFIX}/{FY}/{SEQ:4}", "SRD", "26-27", 7)).isEqualTo("SRD/26-27/0007");
        assertThat(ReceiptNumberFormat.format("{PREFIX}/{FY}/{SEQ:4}", "", "26-27", 7)).isEqualTo("26-27/0007");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> ReceiptNumberFormat.format("{PREFIX}/{FY}/{SEQ:8}", "LONGPREFIX", "26-27", 1)).hasMessageContaining("16 characters");
    }

    @Test
    void moneyFormattingUsesIndianGrouping() {
        assertThat(in.pms.money.Money.format(10000000)).isEqualTo("₹1,00,000");
        assertThat(in.pms.money.Money.format(123456789)).isEqualTo("₹12,34,567.89");
        assertThat(in.pms.money.Money.format(-50)).isEqualTo("-₹0.50");
        assertThat(in.pms.money.FinancialYear.of(java.time.LocalDate.of(2026, 9, 17))).isEqualTo("26-27");
        assertThat(in.pms.money.FinancialYear.of(java.time.LocalDate.of(2026, 3, 31))).isEqualTo("25-26");
    }
}
