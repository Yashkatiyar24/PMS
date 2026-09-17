package in.pms.money;

import java.time.LocalDate;

/** Indian financial year, April to March: 2026-09-17 is in "26-27". */
public final class FinancialYear {
    private FinancialYear() {}

    public static String of(LocalDate date) {
        int start = date.getMonthValue() >= 4 ? date.getYear() : date.getYear() - 1;
        return String.format("%02d-%02d", start % 100, (start + 1) % 100);
    }
}
