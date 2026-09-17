package in.pms.integrations.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class ConsoleEmailProvider implements EmailProvider {
    private static final Logger log = LoggerFactory.getLogger(ConsoleEmailProvider.class);
    @Override public void send(String to, String subject, String html, List<Attachment> attachments) {
        log.info("[console-email] to={} subject={} attachments={} bodyChars={}", to, subject, attachments == null ? 0 : attachments.size(), html.length());
    }
}
