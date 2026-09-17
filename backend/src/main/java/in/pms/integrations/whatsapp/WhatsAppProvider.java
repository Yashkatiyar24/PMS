package in.pms.integrations.whatsapp;

import java.util.List;

/** WhatsApp Business Cloud API: approved utility templates, optional PDF document header. */
public interface WhatsAppProvider {
    /**
     * @param to        phone in E.164 without plus, e.g. 919876543210
     * @param template  approved template name
     * @param language  template language code, e.g. hi or en
     * @param bodyParams positional body variables
     * @param documentUrl optional public/presigned URL of a PDF for the document header
     * @param documentFilename filename shown to the recipient
     */
    void sendTemplate(String to, String template, String language, List<String> bodyParams, String documentUrl, String documentFilename);
}
