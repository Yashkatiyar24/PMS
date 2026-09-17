package in.pms.print;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.Map;

/**
 * QR codes as data URIs, so they work on screen, in a PDF and on a printout without a second request.
 *
 * <p>Error correction is deliberately high: these are read off a desk screen at an angle, in daylight, by
 * whatever phone the guest happens to own, and a code that survives a thumbprint is worth the extra pixels.
 */
public final class Qr {
    private Qr() {}

    /** {@code data:image/png;base64,...} encoding {@code text} at the given pixel size. */
    public static String dataUri(String text, int size) {
        try {
            var matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size,
                    Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.Q, EncodeHintType.MARGIN, 2));
            var out = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException("Cannot build QR code", e);
        }
    }
}
