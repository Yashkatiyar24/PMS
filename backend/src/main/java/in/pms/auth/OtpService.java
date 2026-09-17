package in.pms.auth;

import in.pms.common.BadRequestException;
import in.pms.config.PmsProperties;
import in.pms.integrations.email.EmailProvider;
import in.pms.integrations.sms.SmsProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * One-time codes for phone (SMS) or email login. Codes are stored hashed, expire in minutes, and both sending
 * and verifying are rate-limited per target (PRD U1). An unknown target gets the same response as a known one,
 * so the endpoint cannot be used to enumerate users.
 */
@Service
public class OtpService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient adminJdbc;
    private final SmsProvider sms;
    private final EmailProvider email;
    private final PmsProperties.Auth cfg;

    public OtpService(@Qualifier("adminJdbc") JdbcClient adminJdbc, SmsProvider sms, EmailProvider email, PmsProperties props) {
        this.adminJdbc = adminJdbc; this.sms = sms; this.email = email; this.cfg = props.auth();
    }

    public static String normalisePhone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.startsWith("91") && digits.length() == 12) digits = digits.substring(2);
        if (digits.length() != 10) throw new BadRequestException("Enter a 10-digit mobile number");
        return digits;
    }

    /** Generate and send a code. Silently does nothing for unknown users (same response either way). */
    @Transactional("adminTx")
    public void send(String target) {
        boolean isEmail = target.contains("@");
        String t = isEmail ? target.trim().toLowerCase() : normalisePhone(target);
        Integer recent = adminJdbc.sql("select count(*) from otp_codes where target = ? and created_at > now() - make_interval(mins => ?)")
                .params(t, cfg.otpWindowMinutes()).query(Integer.class).single();
        if (recent >= cfg.otpMaxSendsPerWindow()) throw new BadRequestException("Too many codes requested. Try again in a few minutes.");

        boolean known = !adminJdbc.sql(isEmail ? "select id from users where email = ? and active" : "select id from users where phone = ? and active")
                .param(t).query(UUID.class).list().isEmpty();
        if (!known) return;

        String code = cfg.devOtp() != null && !cfg.devOtp().isBlank() ? cfg.devOtp() : generate(cfg.otpLength());
        adminJdbc.sql("insert into otp_codes(target, code_hash, expires_at) values (?, ?, ?)")
                .params(t, SessionService.sha256(t + ":" + code), OffsetDateTime.now().plusMinutes(cfg.otpTtlMinutes())).update();
        if (isEmail) email.send(t, "Your login code", "<p>Your login code is <b>" + code + "</b>. It expires in " + cfg.otpTtlMinutes() + " minutes.</p>", List.of());
        else sms.sendOtp(t, code);
    }

    /** Verify a code; returns the user id when correct. Counts attempts so codes cannot be brute-forced. */
    @Transactional("adminTx")
    public UUID verify(String target, String code) {
        boolean isEmail = target.contains("@");
        String t = isEmail ? target.trim().toLowerCase() : normalisePhone(target);
        var row = adminJdbc.sql("select id, code_hash, attempts from otp_codes where target = ? and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update")
                .param(t).query().listOfRows().stream().findFirst();
        if (row.isEmpty()) throw new BadRequestException("Code expired or not requested. Request a new one.");
        UUID id = (UUID) row.get().get("id");
        int attempts = (Integer) row.get().get("attempts");
        if (attempts >= cfg.otpMaxVerifyAttempts()) throw new BadRequestException("Too many wrong attempts. Request a new code.");
        boolean ok = SessionService.sha256(t + ":" + code.trim()).equals(row.get().get("code_hash"));
        if (!ok) { adminJdbc.sql("update otp_codes set attempts = attempts + 1 where id = ?").param(id).update(); throw new BadRequestException("Wrong code"); }
        adminJdbc.sql("update otp_codes set consumed_at = now() where id = ?").param(id).update();
        return adminJdbc.sql(isEmail ? "select id from users where email = ? and active" : "select id from users where phone = ? and active")
                .param(t).query(UUID.class).optional().orElseThrow(() -> new BadRequestException("Wrong code"));
    }

    private static String generate(int length) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) sb.append(RANDOM.nextInt(10));
        return sb.toString();
    }
}
