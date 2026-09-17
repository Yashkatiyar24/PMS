package in.pms.integrations.email;

import java.util.List;

/** Email for OTP fallback, daily report fallback and team alerts. */
public interface EmailProvider {
    void send(String to, String subject, String html, List<Attachment> attachments);
    record Attachment(String filename, String contentType, byte[] bytes) {}
}
