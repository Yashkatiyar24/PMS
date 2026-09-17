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
}
