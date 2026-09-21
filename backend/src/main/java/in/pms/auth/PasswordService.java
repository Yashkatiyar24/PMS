package in.pms.auth;

import in.pms.common.BadRequestException;
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

    /** The passwords every guessing list starts with, among those long enough to pass the length rule. */
    private static final java.util.Set<String> COMMON = java.util.Set.of(
            "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
            "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1", "admin123", "letmein1", "abcd1234",
            "abc12345", "11111111", "00000000", "1q2w3e4r", "passw0rd", "p@ssw0rd", "india123", "india@123", "padav123");

    /** A password a person chose for themselves: long enough, not on the first page of any guessing list. */
    public void requireAcceptable(String password) {
        if (password == null || password.length() < 8) throw new BadRequestException("Password must be at least 8 characters");
        if (password.length() > 128) throw new BadRequestException("Password must be at most 128 characters");
        if (COMMON.contains(password.toLowerCase()) || password.chars().distinct().count() < 3)
            throw new BadRequestException("That password is too easy to guess; choose a longer or less common one");
    }

    /** A first password handed to someone new, which they change after signing in: 10 characters, about 50 bits. */
    public String generate() {
        var sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(READABLE.charAt(RANDOM.nextInt(READABLE.length())));
        return sb.toString();
    }
}
