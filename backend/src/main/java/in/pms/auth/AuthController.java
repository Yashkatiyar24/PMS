package in.pms.auth;

import in.pms.common.BadRequestException;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Login by OTP (phone or email) or email + password; session cookie management. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final OtpService otp;
    private final SessionService sessions;
    private final PasswordService passwords;
    private final JdbcClient adminJdbc;

    public AuthController(OtpService otp, SessionService sessions, PasswordService passwords, @Qualifier("adminJdbc") JdbcClient adminJdbc) {
        this.otp = otp; this.sessions = sessions; this.passwords = passwords; this.adminJdbc = adminJdbc;
    }

    public record TargetRequest(@NotBlank String target) {}
    public record VerifyRequest(@NotBlank String target, @NotBlank String code, String deviceName) {}
    public record LoginRequest(@NotBlank String email, @NotBlank String password, String deviceName) {}
    public record SwitchRequest(UUID propertyId) {}

    @PostMapping("/otp/send")
    public Map<String, String> sendOtp(@RequestBody @jakarta.validation.Valid TargetRequest r) {
        otp.send(r.target());
        return Map.of("status", "sent");
    }

    @PostMapping("/otp/verify")
    public Map<String, Object> verifyOtp(@RequestBody @jakarta.validation.Valid VerifyRequest r, HttpServletResponse res) {
        UUID userId = otp.verify(r.target(), r.code());
        return login(userId, r.deviceName(), res);
    }

    @PostMapping("/login")
    @Transactional("adminTx")
    public Map<String, Object> passwordLogin(@RequestBody @jakarta.validation.Valid LoginRequest r, HttpServletResponse res) {
        var row = adminJdbc.sql("select id, password_hash from users where email = ? and active").param(r.email().trim().toLowerCase()).query().listOfRows().stream().findFirst();
        // Always run the hash comparison so timing does not reveal whether the email exists.
        String hash = row.map(m -> (String) m.get("password_hash")).orElse("{bcrypt}$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5XG1tE1dcKgTtqBfDDqjBqzs5eXfy");
        boolean ok = passwords.matches(r.password(), hash) && row.isPresent();
        if (!ok) throw new BadRequestException("Wrong email or password");
        return login((UUID) row.get().get("id"), r.deviceName(), res);
    }

    private Map<String, Object> login(UUID userId, String deviceName, HttpServletResponse res) {
        var s = sessions.create(userId, deviceName);
        long maxAge = Duration.between(OffsetDateTime.now(), s.expiresAt()).toSeconds();
        res.addHeader("Set-Cookie", ResponseCookie.from(sessions.cookieName(), s.token())
                .httpOnly(true).secure(sessions.cookieSecure()).sameSite("Lax").path("/").maxAge(maxAge).build().toString());
        return Map.of("status", "ok", "expiresAt", s.expiresAt());
    }

    @GetMapping("/me")
    public CurrentUser me(@AuthenticationPrincipal CurrentUser user) { return user; }

    @PostMapping("/switch-property")
    public ResponseEntity<Void> switchProperty(@AuthenticationPrincipal CurrentUser user, @RequestBody SwitchRequest r) {
        sessions.switchProperty(user, r.propertyId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal CurrentUser user, HttpServletResponse res) {
        sessions.revoke(user.sessionId(), user.id());
        res.addHeader("Set-Cookie", ResponseCookie.from(sessions.cookieName(), "").httpOnly(true).secure(sessions.cookieSecure()).sameSite("Lax").path("/").maxAge(0).build().toString());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions")
    public List<SessionService.SessionView> mySessions(@AuthenticationPrincipal CurrentUser user) { return sessions.list(user); }

    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id) {
        sessions.revoke(id, user.id());
        return ResponseEntity.noContent().build();
    }
}
