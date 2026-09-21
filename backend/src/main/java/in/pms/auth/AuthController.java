package in.pms.auth;

import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.common.PublicRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
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
    private final PublicRateLimiter limiter;
    private static final String TOO_MANY = "Too many attempts; please wait a few minutes";
    /**
     * Wrong passwords per account and address: ten in a rolling quarter of an hour, then that pair waits. Keyed
     * on both so that someone who knows a property's code and a staff phone cannot lock the desk out from
     * afar with ten bad guesses.
     */
    private final Lockout wrong = new Lockout(10, Duration.ofMinutes(15));
    /** ...per address, so trying one password against many accounts runs out too... */
    private final Lockout wrongFrom = new Lockout(50, Duration.ofMinutes(15));
    /** ...and per account from anywhere, the backstop against guessing spread over many addresses. */
    private final Lockout wrongAccount = new Lockout(100, Duration.ofMinutes(15));

    public AuthController(OtpService otp, SessionService sessions, PasswordService passwords, @Qualifier("adminJdbc") JdbcClient adminJdbc, PublicRateLimiter limiter) {
        this.otp = otp; this.sessions = sessions; this.passwords = passwords; this.adminJdbc = adminJdbc; this.limiter = limiter;
    }

    public record TargetRequest(@NotBlank String target) {}
    public record VerifyRequest(@NotBlank String target, @NotBlank String code, String deviceName) {}
    /** Either the property's code and a mobile number, or an email (the platform admin, an owner on a laptop). */
    public record LoginRequest(String email, String code, String phone, @NotBlank String password, String deviceName) {}
    public record SwitchRequest(UUID propertyId) {}

    /** Open to anyone, so each address gets a small allowance: codes cost money to send and are worth guessing. */
    @PostMapping("/otp/send")
    public Map<String, String> sendOtp(@RequestBody @jakarta.validation.Valid TargetRequest r, HttpServletRequest req) {
        if (!limiter.allow("otp-send:" + req.getRemoteAddr(), 10)) throw new ForbiddenException(TOO_MANY);
        otp.send(r.target());
        return Map.of("status", "sent");
    }

    @PostMapping("/otp/verify")
    public Map<String, Object> verifyOtp(@RequestBody @jakarta.validation.Valid VerifyRequest r, HttpServletRequest req, HttpServletResponse res) {
        if (!limiter.allow("otp-verify:" + req.getRemoteAddr(), 20)) throw new ForbiddenException(TOO_MANY);
        UUID userId = otp.verify(r.target(), r.code());
        return login(userId, r.deviceName(), res);
    }

    @PostMapping("/login")
    @Transactional("adminTx")
    public Map<String, Object> passwordLogin(@RequestBody @jakarta.validation.Valid LoginRequest r, HttpServletRequest req, HttpServletResponse res) {
        boolean byCode = r.code() != null && !r.code().isBlank();
        String code = byCode ? r.code().replaceAll("[^A-Za-z0-9]", "").toUpperCase() : null;
        String phone = byCode ? OtpService.normalisePhone(r.phone() == null ? "" : r.phone()) : null;
        String email = byCode ? null : r.email() == null ? "" : r.email().trim().toLowerCase();
        String account = byCode ? code + ":" + phone : email;
        String from = req.getRemoteAddr();
        String pair = account + "|" + from;
        if (wrong.locked(pair) || wrongFrom.locked(from) || wrongAccount.locked(account)) throw new ForbiddenException(TOO_MANY);

        // Someone deactivated at this property, or working only elsewhere, is not found here.
        var row = (byCode
                ? adminJdbc.sql("""
                        select u.id, u.password_hash, p.id as property_id
                        from properties p
                        join property_users pu on pu.property_id = p.id and pu.active
                        join users u on u.id = pu.user_id and u.active
                        where p.code = ? and p.active and u.phone = ?""").params(code, phone)
                : adminJdbc.sql("select id, password_hash, null::uuid as property_id from users where email = ? and active").param(email))
                .query().listOfRows().stream().findFirst();
        // Always run the hash comparison so timing does not reveal whether the account exists.
        String hash = row.map(m -> (String) m.get("password_hash")).orElse("{bcrypt}$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5XG1tE1dcKgTtqBfDDqjBqzs5eXfy");
        boolean ok = passwords.matches(r.password(), hash) && row.isPresent();
        if (!ok) {
            wrong.fail(pair);
            wrongFrom.fail(from);
            wrongAccount.fail(account);
            throw new BadRequestException(byCode ? "Wrong property code, mobile number or password" : "Wrong email or password");
        }
        wrong.clear(pair);
        wrongAccount.clear(account);
        return login((UUID) row.get().get("id"), r.deviceName(), (UUID) row.get().get("property_id"), res);
    }

    private Map<String, Object> login(UUID userId, String deviceName, HttpServletResponse res) { return login(userId, deviceName, null, res); }

    private Map<String, Object> login(UUID userId, String deviceName, UUID propertyId, HttpServletResponse res) {
        var s = sessions.create(userId, deviceName, propertyId);
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
