package in.pms.integrations.whatsapp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class ConsoleWhatsAppProvider implements WhatsAppProvider {
    private static final Logger log = LoggerFactory.getLogger(ConsoleWhatsAppProvider.class);
    @Override public void sendTemplate(String to, String template, String language, List<String> bodyParams, String documentUrl, String documentFilename) {
        // The parameters are guest names and amounts: not for a log. Enough here to see that a message would have gone.
        log.info("[console-whatsapp] to=****{} template={} lang={} params={} doc={}", to.substring(Math.max(0, to.length() - 4)), template, language, bodyParams.size(), documentFilename != null);
    }
}
