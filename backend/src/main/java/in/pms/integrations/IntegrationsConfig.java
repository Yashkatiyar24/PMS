package in.pms.integrations;

import in.pms.config.PmsProperties;
import in.pms.integrations.email.*;
import in.pms.integrations.pdf.*;
import in.pms.integrations.push.*;
import in.pms.integrations.sms.*;
import in.pms.integrations.storage.*;
import in.pms.integrations.whatsapp.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Chooses one implementation per integration from configuration. Adding a provider means one class and
 * one case here; nothing else in the code knows which vendor is behind an interface.
 */
@Configuration
public class IntegrationsConfig {

    @Bean
    public SignedUrlSigner signedUrlSigner(Environment env) {
        return new SignedUrlSigner(env.getRequiredProperty("pms.session-secret"));
    }

    @Bean
    public StorageProvider storageProvider(PmsProperties p, SignedUrlSigner signer) {
        return switch (p.storage().provider()) {
            case "s3" -> new S3StorageProvider(p.storage().s3());
            // Links are served by this API's FilesController, so they must carry the API's origin, not the app's.
            case "local" -> new LocalStorageProvider(p.storage().localDir(), p.apiUrl(), signer);
            default -> throw new IllegalArgumentException("Unknown storage provider " + p.storage().provider());
        };
    }

    @Bean
    public SmsProvider smsProvider(PmsProperties p) {
        return switch (p.sms().provider()) {
            case "msg91" -> new Msg91SmsProvider(p.sms().msg91());
            case "console" -> new ConsoleSmsProvider();
            // No SMS account yet: phone codes are refused up front (OtpService), never logged.
            case "off" -> (phone, code) -> { throw new IllegalStateException("SMS is switched off (PMS_SMS_PROVIDER=off)"); };
            default -> throw new IllegalArgumentException("Unknown sms provider " + p.sms().provider());
        };
    }

    @Bean
    public EmailProvider emailProvider(PmsProperties p) {
        return switch (p.email().provider()) {
            case "brevo" -> new BrevoEmailProvider(p.email().brevo().apiKey(), p.email().from());
            case "console" -> new ConsoleEmailProvider();
            // No email account yet: email codes are refused up front (OtpService); outbox mail waits and retries.
            case "off" -> (to, subject, html, attachments) -> { throw new IllegalStateException("Email is switched off (PMS_EMAIL_PROVIDER=off)"); };
            default -> throw new IllegalArgumentException("Unknown email provider " + p.email().provider());
        };
    }

    @Bean
    public WhatsAppProvider whatsAppProvider(PmsProperties p) {
        return switch (p.whatsapp().provider()) {
            case "meta" -> new MetaWhatsAppProvider(p.whatsapp().meta());
            case "console" -> new ConsoleWhatsAppProvider();
            default -> throw new IllegalArgumentException("Unknown whatsapp provider " + p.whatsapp().provider());
        };
    }

    @Bean
    public PushProvider pushProvider(PmsProperties p) {
        return switch (p.push().provider()) {
            case "fcm" -> new FcmPushProvider(p.push().fcm().credentialsJson());
            case "console" -> new ConsolePushProvider();
            default -> throw new IllegalArgumentException("Unknown push provider " + p.push().provider());
        };
    }

    @Bean
    public in.pms.integrations.payments.PaymentGateway paymentGateway(PmsProperties p) {
        String provider = p.payments() == null || p.payments().provider() == null ? "none" : p.payments().provider();
        return switch (provider) {
            case "razorpay" -> new in.pms.integrations.payments.RazorpayGateway(p.payments().razorpay());
            case "console" -> new in.pms.integrations.payments.ConsoleGateway();
            case "none" -> new in.pms.integrations.payments.DisabledGateway();
            default -> throw new IllegalArgumentException("Unknown payment provider " + provider);
        };
    }

    @Bean
    public PdfRenderer pdfRenderer(PmsProperties p) {
        return switch (p.pdf().provider()) {
            case "openhtml" -> new OpenHtmlPdfRenderer();
            case "none" -> new NoopPdfRenderer();
            default -> throw new IllegalArgumentException("Unknown pdf provider " + p.pdf().provider());
        };
    }
}
