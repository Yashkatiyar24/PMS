package in.pms.auth;

import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** Password and approval-PIN hashing (bcrypt by default; encoded values carry their algorithm id). */
@Service
public class PasswordService {
    private final PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
    public String hash(String plain) { return encoder.encode(plain); }
    public boolean matches(String plain, String encoded) { return encoded != null && encoder.matches(plain, encoded); }

    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();
    /** No 0/O, 1/l/I: it is read out over the phone or copied from a screen. */
    private static final String READABLE = "abcdefghjkmnpqrstuvwxyz23456789";

    /** A first password handed to someone new, which they change after signing in: 10 characters, about 50 bits. */
    public String generate() {
        var sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(READABLE.charAt(RANDOM.nextInt(READABLE.length())));
        return sb.toString();
    }
}
