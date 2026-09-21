package in.pms.auth;

import in.pms.common.BadRequestException;
import in.pms.config.PmsProperties;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** With SMS off, a phone code is refused up front, so nobody waits for a text that will never come. */
class SmsOffTest {
    @Test
    void aPhoneCodeIsRefusedWhenSmsIsOff() {
        var props = new PmsProperties("https://desk.example", "https://desk.example", "a-real-secret-of-at-least-32-characters", java.util.List.of(), true,
                "Asia/Kolkata", null, new PmsProperties.Auth(6, 10, 5, 15, 5, ""), null, new PmsProperties.Sms("off", null), null, null, null, null, null, null, null);
        assertThatThrownBy(() -> new OtpService(null, null, null, props).send("9000000001"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("SMS");
    }
}
