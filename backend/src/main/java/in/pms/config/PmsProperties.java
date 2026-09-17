package in.pms.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/** Typed view of the {@code pms.*} configuration block. Values come from application.yml and environment variables. */
@ConfigurationProperties(prefix = "pms")
public record PmsProperties(
        String appUrl,
        String sessionSecret,
        List<String> allowedOrigins,
        boolean cookieSecure,
        String defaultTimezone,
        Db db,
        Auth auth,
        Storage storage,
        Sms sms,
        Email email,
        WhatsApp whatsapp,
        Push push,
        Pdf pdf,
        Jobs jobs,
        Ops ops
) {
    public record Db(Pool app, Pool admin) {}
    public record Pool(String url, String username, String password, int maxPoolSize) {}
    public record Auth(int otpLength, int otpTtlMinutes, int otpMaxSendsPerWindow, int otpWindowMinutes, int otpMaxVerifyAttempts, String devOtp) {}
    public record Storage(String provider, String localDir, int signedUrlMinutes, S3 s3) {}
    public record S3(String endpoint, String region, String bucket, String accessKey, String secretKey, boolean pathStyle) {}
    public record Sms(String provider, Msg91 msg91) {}
    public record Msg91(String authKey, String senderId, String otpTemplateId) {}
    public record Email(String provider, String from, Brevo brevo) {}
    public record Brevo(String apiKey) {}
    public record WhatsApp(String provider, Meta meta) {}
    public record Meta(String phoneNumberId, String accessToken, String apiVersion) {}
    public record Push(String provider, Fcm fcm) {}
    public record Fcm(String credentialsJson) {}
    public record Pdf(String provider) {}
    public record Jobs(boolean enabled, long outboxPollMs, int outboxMaxAttempts) {}
    public record Ops(String teamAlertEmail) {}
}
