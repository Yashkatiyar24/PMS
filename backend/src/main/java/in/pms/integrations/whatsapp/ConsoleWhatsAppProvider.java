package in.pms.integrations.whatsapp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class ConsoleWhatsAppProvider implements WhatsAppProvider {
    private static final Logger log = LoggerFactory.getLogger(ConsoleWhatsAppProvider.class);
    @Override public void sendTemplate(String to, String template, String language, List<String> bodyParams, String documentUrl, String documentFilename) {
        log.info("[console-whatsapp] to=****{} template={} lang={} params={} doc={}", to.substring(Math.max(0, to.length() - 4)), template, language, bodyParams, documentFilename);
    }
}
