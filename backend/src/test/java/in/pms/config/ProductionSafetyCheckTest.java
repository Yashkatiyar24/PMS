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
        return new PmsProperties("https://desk.example", secret, origins, cookieSecure, "Asia/Kolkata",
                null, auth, null, null, null, null, null, null, null, null, null);
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
