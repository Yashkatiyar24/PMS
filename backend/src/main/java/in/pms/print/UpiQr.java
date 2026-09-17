package in.pms.print;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

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
        try {
            var matrix = new QRCodeWriter().encode(intent(vpa, payeeName, amountPaise, note), BarcodeFormat.QR_CODE, size, size,
                    Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M, EncodeHintType.MARGIN, 1));
            var out = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) { throw new IllegalStateException("Cannot build UPI QR", e); }
    }

    private static String enc(String s) { return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8); }
}
