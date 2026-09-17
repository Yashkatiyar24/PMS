package in.pms.print;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * UPI collection QR from the property's own VPA, so money goes straight to the trust with no gateway fee.
 * Returned as a data URI so it works on screen, in the PDF and on a printout without another request.
 */
public final class UpiQr {
    private UpiQr() {}

    public static String intent(String vpa, String payeeName, long amountPaise, String note) {
        StringBuilder sb = new StringBuilder("upi://pay?pa=").append(enc(vpa)).append("&pn=").append(enc(payeeName)).append("&cu=INR");
        if (amountPaise > 0) sb.append("&am=").append(amountPaise / 100).append('.').append(String.format("%02d", amountPaise % 100));
        if (note != null && !note.isBlank()) sb.append("&tn=").append(enc(note));
        return sb.toString();
    }

    /** {@code data:image/png;base64,...} at the given pixel size, or null when the property has no VPA. */
    public static String dataUri(String vpa, String payeeName, long amountPaise, String note, int size) {
        if (vpa == null || vpa.isBlank()) return null;
        return Qr.dataUri(intent(vpa, payeeName, amountPaise, note), size);
    }

    private static String enc(String s) { return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8); }
}
