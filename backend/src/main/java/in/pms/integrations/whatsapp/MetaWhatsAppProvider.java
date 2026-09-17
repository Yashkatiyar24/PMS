package in.pms.integrations.whatsapp;

import in.pms.config.PmsProperties;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Meta Cloud API, direct (no BSP). Templates must be pre-approved in the utility category. */
public class MetaWhatsAppProvider implements WhatsAppProvider {
    private final RestClient http;
    private final String phoneNumberId;

    public MetaWhatsAppProvider(PmsProperties.Meta cfg) {
        this.phoneNumberId = cfg.phoneNumberId();
        this.http = RestClient.builder().baseUrl("https://graph.facebook.com/" + cfg.apiVersion())
                .defaultHeader("Authorization", "Bearer " + cfg.accessToken()).build();
    }

    @Override public void sendTemplate(String to, String template, String language, List<String> bodyParams, String documentUrl, String documentFilename) {
        List<Map<String, Object>> components = new ArrayList<>();
        if (documentUrl != null) {
            components.add(Map.of("type", "header", "parameters", List.of(Map.of("type", "document",
                    "document", Map.of("link", documentUrl, "filename", documentFilename == null ? "receipt.pdf" : documentFilename)))));
        }
        if (bodyParams != null && !bodyParams.isEmpty()) {
            List<Map<String, String>> params = bodyParams.stream().map(p -> Map.of("type", "text", "text", p)).toList();
            components.add(Map.of("type", "body", "parameters", params));
        }
        var body = Map.of("messaging_product", "whatsapp", "to", to, "type", "template",
                "template", Map.of("name", template, "language", Map.of("code", language), "components", components));
        http.post().uri("/{id}/messages", phoneNumberId).body(body).retrieve().toBodilessEntity();
    }
}
