package in.pms.money;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** Paise arithmetic and Indian formatting (₹1,00,000.00). Money is always a long in paise; never a double. */
public final class Money {
    private Money() {}

    /** Round-half-up percentage in basis points: {@code percentOf(10000, 500) == 500} (5% of ₹100 = ₹5). */
    public static long percentBp(long paise, int bp) {
        return Math.floorDiv(paise * bp + 5000, 10000);
    }

    public static String format(long paise) {
        long rupees = Math.abs(paise) / 100, p = Math.abs(paise) % 100;
        String r = new DecimalFormat("#,##,##0", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(rupees);
        // DecimalFormat cannot express Indian grouping; regroup manually: last 3 digits, then pairs.
        String digits = Long.toString(rupees);
        if (digits.length() > 3) {
            String last3 = digits.substring(digits.length() - 3);
            String rest = digits.substring(0, digits.length() - 3);
            StringBuilder sb = new StringBuilder();
            while (rest.length() > 2) { sb.insert(0, "," + rest.substring(rest.length() - 2)); rest = rest.substring(0, rest.length() - 2); }
            r = rest + sb + "," + last3;
        }
        return (paise < 0 ? "-" : "") + "₹" + r + (p == 0 ? "" : String.format(".%02d", p));
    }
}
