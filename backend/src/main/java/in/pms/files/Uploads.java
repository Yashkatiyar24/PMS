package in.pms.files;

import in.pms.common.BadRequestException;

import java.io.IOException;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.io.UncheckedIOException;

/** What a browser declares about a file is a claim; the first bytes are the fact, and only a match is stored. */
public final class Uploads {
    private Uploads() {}

    public static InputStream checked(InputStream data, String contentType) {
        try {
            var in = new PushbackInputStream(data, 12);
            byte[] head = in.readNBytes(12);
            in.unread(head);
            if (!matches(head, contentType)) throw new BadRequestException("That file is not a " + name(contentType));
            return in;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static boolean matches(byte[] h, String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> starts(h, 0xFF, 0xD8, 0xFF);
            case "image/png" -> starts(h, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            case "image/webp" -> starts(h, 'R', 'I', 'F', 'F') && h.length >= 12 && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P';
            case "application/pdf" -> starts(h, '%', 'P', 'D', 'F', '-');
            default -> false;
        };
    }

    private static boolean starts(byte[] h, int... expected) {
        if (h.length < expected.length) return false;
        for (int i = 0; i < expected.length; i++) if ((h[i] & 0xff) != expected[i]) return false;
        return true;
    }

    private static String name(String contentType) {
        return switch (contentType) { case "image/jpeg" -> "JPEG image"; case "image/png" -> "PNG image"; case "image/webp" -> "WebP image"; case "application/pdf" -> "PDF"; default -> "supported file"; };
    }
}
