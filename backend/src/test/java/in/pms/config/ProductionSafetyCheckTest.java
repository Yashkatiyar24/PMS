package in.pms.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The guard only earns its place if it actually fires, so each development default is checked on its own:
 * a single missed variable is exactly the case it exists for.
 */
class ProductionSafetyCheckTest {

    /** A configuration that is safe for production, which each case below then spoils in one way. */
    private static PmsProperties safe() {
        return props("a-real-secret-of-at-least-32-characters", "", true, List.of("https://desk.example"));
    }

    private static PmsProperties props(String secret, String devOtp, boolean cookieSecure, List<String> origins) {
        var auth = new PmsProperties.Auth(6, 10, 5, 15, 5, devOtp);
        return new PmsProperties("https://desk.example", "https://desk.example", secret, origins, cookieSecure, "Asia/Kolkata",
                null, auth, null, null, null, null, null, null, null, null, null);
    }

    /** The safe configuration with real provider and database settings, which each case below then spoils. */
    private static PmsProperties with(PmsProperties.Sms sms, PmsProperties.Email email, PmsProperties.Db db) {
        var s = safe();
        return new PmsProperties(s.appUrl(), s.apiUrl(), s.sessionSecret(), s.allowedOrigins(), s.cookieSecure(), s.defaultTimezone(),
                db, s.auth(), null, sms, email, null, null, null, null, null, null);
    }

    @Test
    void theConsoleSmsProviderIsRefusedBecauseItLogsEveryLoginCode() {
        assertThatThrownBy(() -> check(with(new PmsProperties.Sms("console", null), null, null))).hasMessageContaining("PMS_SMS_PROVIDER");
        check(with(new PmsProperties.Sms("msg91", null), null, null));
    }

    @Test
    void databaseRolesStillOnTheirCreationPasswordsAreRefused() {
        var shipped = new PmsProperties.Pool("jdbc:postgresql://db/pms", "pms_app", "pms_app", 4);
        var strong = new PmsProperties.Pool("jdbc:postgresql://db/pms", "pms_app", "k9v2m4x8q1w3e5r7t0y6", 4);
        assertThatThrownBy(() -> check(with(null, null, new PmsProperties.Db(shipped, strong)))).hasMessageContaining("PMS_DB_APP_PASSWORD");
        assertThatThrownBy(() -> check(with(null, null, new PmsProperties.Db(strong, new PmsProperties.Pool("jdbc:postgresql://db/pms", "pms_admin", "short", 4))))).hasMessageContaining("PMS_DB_ADMIN_PASSWORD");
        check(with(null, null, new PmsProperties.Db(strong, strong)));
    }

    private static void check(PmsProperties props, String... properties) {
        var env = new MockEnvironment();
        for (int i = 0; i < properties.length; i += 2) env.setProperty(properties[i], properties[i + 1]);
        new ProductionSafetyCheck(props, env).verify();
    }

    @Test
    void aProperlyConfiguredServerStarts() {
        assertThatCode(() -> check(safe())).doesNotThrowAnyException();
    }

    @Test
    void theShippedSessionSecretIsRefused() {
        assertThatThrownBy(() -> check(props(ProductionSafetyCheck.DEV_SESSION_SECRET, "", true, List.of("https://desk.example"))))
                .hasMessageContaining("PMS_SESSION_SECRET");
    }

    @Test
    void aShortSessionSecretIsRefused() {
        assertThatThrownBy(() -> check(props("too-short", "", true, List.of("https://desk.example"))))
                .hasMessageContaining("PMS_SESSION_SECRET");
    }

    @Test
    void aFixedLoginCodeIsRefused() {
        assertThatThrownBy(() -> check(props("a-real-secret-of-at-least-32-characters", "123456", true, List.of("https://desk.example"))))
                .hasMessageContaining("PMS_DEV_OTP");
    }

    @Test
    void theDemoSeederIsRefused() {
        assertThatThrownBy(() -> check(safe(), "pms.seed.enabled", "true"))
                .hasMessageContaining("seed");
    }

    @Test
    void aCookieThatWouldTravelOverPlainHttpIsRefused() {
        assertThatThrownBy(() -> check(props("a-real-secret-of-at-least-32-characters", "", false, List.of("https://desk.example"))))
                .hasMessageContaining("PMS_COOKIE_SECURE");
    }

    @Test
    void originsStillPointingAtTheDevServerAreRefused() {
        assertThatThrownBy(() -> check(props("a-real-secret-of-at-least-32-characters", "", true, List.of("http://localhost:3000"))))
                .hasMessageContaining("PMS_ALLOWED_ORIGINS");
    }

    @Test
    void everyProblemIsReportedAtOnceRatherThanOneRestartAtATime() {
        assertThatThrownBy(() -> check(props(ProductionSafetyCheck.DEV_SESSION_SECRET, "123456", false, List.of("*"))))
                .satisfies(e -> assertThat(e.getMessage())
                        .contains("PMS_SESSION_SECRET").contains("PMS_DEV_OTP")
                        .contains("PMS_COOKIE_SECURE").contains("PMS_ALLOWED_ORIGINS"));
    }

    @Test
    void aDevelopmentMachineIsLeftAlone() {
        var env = new MockEnvironment();
        env.setActiveProfiles("dev");
        env.setProperty("pms.seed.enabled", "true");
        assertThatCode(() -> new ProductionSafetyCheck(props(ProductionSafetyCheck.DEV_SESSION_SECRET, "123456", false, List.of("http://localhost:3000")), env)
                .verify()).doesNotThrowAnyException();
    }
}
