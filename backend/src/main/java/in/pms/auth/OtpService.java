package in.pms.auth;

import in.pms.common.BadRequestException;
import in.pms.config.PmsProperties;
import in.pms.integrations.email.EmailProvider;
import in.pms.integrations.sms.SmsProvider;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One-time codes for phone (SMS) or email login. Codes are stored hashed, expire in minutes, and both sending
 * and verifying are rate-limited per target (PRD U1).
 *
 * <p>An unknown target is indistinguishable from a known one: it gets a row too (with a hash nothing can match),
 * so it runs out of sends at the same point, answers "wrong code" the same way, and takes the same time, because
 * delivery to the real provider happens off the request thread. The login endpoints cannot be used to find out
 * which numbers work here.
 */
@Service
public class OtpService {
    private static final Logger log = LoggerFactory.getLogger(OtpService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    static final String WRONG = "Wrong or expired code";
    private final JdbcClient adminJdbc;
    private final SmsProvider sms;
    private final EmailProvider email;
    private final PmsProperties.Auth cfg;
    private final boolean smsOff;
    private final boolean emailOff;
    private final ExecutorService delivery = Executors.newVirtualThreadPerTaskExecutor();

    public OtpService(@Qualifier("adminJdbc") JdbcClient adminJdbc, SmsProvider sms, EmailProvider email, PmsProperties props) {
        this.adminJdbc = adminJdbc; this.sms = sms; this.email = email; this.cfg = props.auth();
        this.smsOff = props.sms() != null && "off".equals(props.sms().provider());
        this.emailOff = props.email() != null && "off".equals(props.email().provider());
    }

    @PreDestroy void close() { delivery.close(); }

    public static String normalisePhone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.startsWith("91") && digits.length() == 12) digits = digits.substring(2);
        if (digits.length() != 10) throw new BadRequestException("Enter a 10-digit mobile number");
        return digits;
    }

    public static String normaliseEmail(String raw) {
        String email = raw == null ? "" : raw.trim().toLowerCase();
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new BadRequestException("Enter a valid email address");
        return email;
    }

    /** Generate and send a code. An unknown target gets the same response, and the same allowance used up. */
    @Transactional("adminTx")
    public void send(String target) {
        boolean isEmail = target.contains("@");
        if (!isEmail && smsOff) throw new BadRequestException("Codes by SMS are not available yet. Sign in with your email, or your property code and password.");
        if (isEmail && emailOff) throw new BadRequestException("Codes by email are not available yet. Sign in with your property code, email and password.");
        String t = isEmail ? target.trim().toLowerCase() : normalisePhone(target);
        Integer recent = adminJdbc.sql("select count(*) from otp_codes where target = ? and created_at > now() - make_interval(mins => ?)")
                .params(t, cfg.otpWindowMinutes()).query(Integer.class).single();
        if (recent >= cfg.otpMaxSendsPerWindow()) throw new BadRequestException("Too many codes requested. Try again in a few minutes.");

        boolean known = !adminJdbc.sql(isEmail ? "select id from users where email = ? and active" : "select id from users where phone = ? and active")
                .param(t).query(UUID.class).list().isEmpty();
        String code = cfg.devOtp() != null && !cfg.devOtp().isBlank() ? cfg.devOtp() : generate(cfg.otpLength());
        // For a stranger the stored hash is of random bytes: a row that counts and can never be satisfied.
        String hash = known ? SessionService.sha256(t + ":" + code) : SessionService.sha256(t + ":" + randomHex());
        adminJdbc.sql("insert into otp_codes(target, code_hash, expires_at) values (?, ?, ?)")
                .params(t, hash, OffsetDateTime.now().plusMinutes(cfg.otpTtlMinutes())).update();
        if (known) delivery.execute(() -> deliver(isEmail, t, code));
    }

    private void deliver(boolean isEmail, String target, String code) {
        try {
            if (isEmail) email.send(target, "Your login code", "<p>Your login code is <b>" + code + "</b>. It expires in " + cfg.otpTtlMinutes() + " minutes.</p>", List.of());
            else sms.sendOtp(target, code);
        } catch (RuntimeException e) {
            log.warn("Login code could not be delivered to {}", mask(target), e);
        }
    }

    /** Verify a code; returns the user id when correct. Counts attempts so codes cannot be brute-forced. */
    @Transactional("adminTx")
    public UUID verify(String target, String code) {
        boolean isEmail = target.contains("@");
        String t = isEmail ? target.trim().toLowerCase() : normalisePhone(target);
        var row = adminJdbc.sql("select id, code_hash, attempts from otp_codes where target = ? and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update")
                .param(t).query().listOfRows().stream().findFirst();
        if (row.isEmpty()) throw new BadRequestException(WRONG);
        UUID id = (UUID) row.get().get("id");
        int attempts = (Integer) row.get().get("attempts");
        if (attempts >= cfg.otpMaxVerifyAttempts()) throw new BadRequestException("Too many wrong attempts. Request a new code.");
        boolean ok = SessionService.sha256(t + ":" + code.trim()).equals(row.get().get("code_hash"));
        if (!ok) { adminJdbc.sql("update otp_codes set attempts = attempts + 1 where id = ?").param(id).update(); throw new BadRequestException(WRONG); }
        adminJdbc.sql("update otp_codes set consumed_at = now() where id = ?").param(id).update();
        return adminJdbc.sql(isEmail ? "select id from users where email = ? and active" : "select id from users where phone = ? and active")
                .param(t).query(UUID.class).optional().orElseThrow(() -> new BadRequestException(WRONG));
    }

    private static String generate(int length) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) sb.append(RANDOM.nextInt(10));
        return sb.toString();
    }

    private static String randomHex() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    private static String mask(String target) {
        int at = target.indexOf('@');
        return at > 0 ? target.charAt(0) + "***" + target.substring(at) : "******" + target.substring(Math.max(0, target.length() - 4));
    }
}
