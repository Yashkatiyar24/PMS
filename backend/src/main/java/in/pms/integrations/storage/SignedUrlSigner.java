package in.pms.integrations.storage;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

/** HMAC signatures for local-storage download links, so a key alone is never enough to fetch a file. */
public class SignedUrlSigner {
    private final byte[] secret;

    public SignedUrlSigner(String secret) { this.secret = secret.getBytes(StandardCharsets.UTF_8); }

    public String sign(String key, long expEpochSeconds) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((key + "|" + expEpochSeconds).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    public boolean verify(String key, long expEpochSeconds, String sig) {
        if (Instant.now().getEpochSecond() > expEpochSeconds || sig == null) return false;
        return MessageDigest.isEqual(sign(key, expEpochSeconds).getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8));
    }
}
