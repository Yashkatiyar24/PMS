package in.pms.config;

import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Refuses to serve with development settings left on.
 *
 * Every one of these is a working default that makes local development pleasant and production unsafe, and
 * the difference between the two is one forgotten environment variable. A server that will not start is a
 * five-minute problem; a server running with a known session secret and a fixed OTP is not a problem anyone
 * notices until it is far too late.
 *
 * "Production" here means any run without the {@code dev} or {@code test} profile, so it is the default and
 * has to be opted out of rather than into. The check runs while the context is still being built, so a
 * server that fails it never binds its port and never answers a single request.
 */
@Component
public class ProductionSafetyCheck {

    /** The value shipped in application.yml, which must never reach a real deployment. */
    static final String DEV_SESSION_SECRET = "dev-only-change-me-32-bytes-minimum!!";

    private final PmsProperties props;
    private final Environment env;

    public ProductionSafetyCheck(PmsProperties props, Environment env) {
        this.props = props;
        this.env = env;
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    @PostConstruct
    public void verify() {
        List<String> profiles = List.of(env.getActiveProfiles());
        if (profiles.contains("dev") || profiles.contains("test")) return;

        var problems = new ArrayList<String>();
        if (DEV_SESSION_SECRET.equals(props.sessionSecret()) || props.sessionSecret() == null || props.sessionSecret().length() < 32)
            problems.add("PMS_SESSION_SECRET is unset, too short, or still the development value. "
                    + "File download links are signed with it, so anyone who reads this file can forge one. "
                    + "Set it to at least 32 random characters.");
        if (props.auth().devOtp() != null && !props.auth().devOtp().isBlank())
            problems.add("PMS_DEV_OTP is set, which makes every login code the same value. Unset it.");
        if (env.getProperty("pms.seed.enabled", Boolean.class, false))
            problems.add("pms.seed.enabled is true, which creates demo staff with a published password. Unset it.");
        if (!props.cookieSecure())
            problems.add("PMS_COOKIE_SECURE is false, so the session cookie will travel over plain HTTP. "
                    + "Set it to true once the site is behind HTTPS.");
        if (props.allowedOrigins() == null || props.allowedOrigins().isEmpty()
                || props.allowedOrigins().stream().anyMatch(o -> o.contains("localhost") || o.equals("*")))
            problems.add("PMS_ALLOWED_ORIGINS is empty, a wildcard, or still points at localhost. "
                    + "List the origins the desk app is actually served from.");

        if (props.payments() != null && "console".equals(props.payments().provider()))
            problems.add("PMS_PAYMENT_PROVIDER is console, a simulator that accepts payments nobody made. "
                    + "Use razorpay, or none to switch online payment off.");
        if (props.payments() != null && "razorpay".equals(props.payments().provider()) && props.payments().razorpay() != null
                && (blank(props.payments().razorpay().keySecret()) || blank(props.payments().razorpay().webhookSecret())))
            problems.add("PMS_PAYMENT_PROVIDER is razorpay but PMS_RAZORPAY_KEY_SECRET or PMS_RAZORPAY_WEBHOOK_SECRET is empty, "
                    + "so no payment could be verified.");

        if (problems.isEmpty()) return;
        throw new IllegalStateException("Refusing to start with development settings in production:\n  - "
                + String.join("\n  - ", problems)
                + "\n\nRun with --spring.profiles.active=dev if this is a development machine.");
    }
}
