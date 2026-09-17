package in.pms.integrations.email;

import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/** Brevo (Sendinblue) transactional email API v3. */
public class BrevoEmailProvider implements EmailProvider {
    private final RestClient http;
    private final String fromName, fromEmail;

    public BrevoEmailProvider(String apiKey, String from) {
        this.http = RestClient.builder().baseUrl("https://api.brevo.com/v3").defaultHeader("api-key", apiKey).build();
        // "Name <addr>" or "addr"
        int lt = from.indexOf('<');
        this.fromName = lt > 0 ? from.substring(0, lt).trim() : "PMS";
        this.fromEmail = lt > 0 ? from.substring(lt + 1, from.indexOf('>')).trim() : from.trim();
    }

    @Override public void send(String to, String subject, String html, List<Attachment> attachments) {
        List<Map<String, String>> att = new ArrayList<>();
        if (attachments != null) for (var a : attachments) att.add(Map.of("name", a.filename(), "content", Base64.getEncoder().encodeToString(a.bytes())));
        var body = Map.of(
                "sender", Map.of("name", fromName, "email", fromEmail),
                "to", List.of(Map.of("email", to)),
                "subject", subject, "htmlContent", html, "attachment", att);
        http.post().uri("/smtp/email").body(body).retrieve().toBodilessEntity();
    }
}
