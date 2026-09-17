package in.pms.integrations.sms;

import in.pms.config.PmsProperties;
import org.springframework.web.client.RestClient;

import java.util.Map;

/** MSG91 OTP API. Template must be DLT-approved and contain the ##OTP## variable. */
public class Msg91SmsProvider implements SmsProvider {
    private final RestClient http;
    private final PmsProperties.Msg91 cfg;

    public Msg91SmsProvider(PmsProperties.Msg91 cfg) {
        this.cfg = cfg;
        this.http = RestClient.builder().baseUrl("https://control.msg91.com/api/v5").defaultHeader("authkey", cfg.authKey()).build();
    }

    @Override public void sendOtp(String phone, String code) {
        http.post().uri("/otp?template_id={t}&mobile={m}&otp={o}", cfg.otpTemplateId(), "91" + phone, code)
                .body(Map.of()).retrieve().toBodilessEntity();
    }
}
