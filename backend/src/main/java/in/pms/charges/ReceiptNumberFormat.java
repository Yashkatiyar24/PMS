package in.pms.charges;

import in.pms.common.BadRequestException;

/**
 * Formats receipt numbers from a pattern such as {@code {PREFIX}/{FY}/{SEQ:4}}.
 * GST caps invoice serials at 16 characters, so the result is validated.
 */
public final class ReceiptNumberFormat {
    private ReceiptNumberFormat() {}

    public static String format(String pattern, String prefix, String fy, int seq) {
        String out = pattern.replace("{PREFIX}", prefix == null ? "" : prefix).replace("{FY}", fy);
        var m = java.util.regex.Pattern.compile("\\{SEQ(?::(\\d+))?}").matcher(out);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int width = m.group(1) == null ? 1 : Integer.parseInt(m.group(1));
            m.appendReplacement(sb, String.format("%0" + width + "d", seq));
        }
        m.appendTail(sb);
        String number = sb.toString().replaceAll("^/+", "");
        if (number.length() > 16) throw new BadRequestException("Receipt number '" + number + "' exceeds 16 characters; shorten receipt_prefix or receipt_number_format");
        return number;
    }
}
