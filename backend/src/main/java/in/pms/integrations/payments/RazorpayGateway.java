package in.pms.integrations.payments;

import com.fasterxml.jackson.databind.JsonNode;
import in.pms.config.PmsProperties;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Razorpay, through its REST API (Orders, Payments, Refunds) and webhooks.
 *
 * <p>Signatures are HMAC-SHA256 in hex: over {@code order_id|payment_id} with the key secret for the checkout,
 * and over the raw body with the webhook secret for webhooks. They are compared in constant time.
 */
public class RazorpayGateway implements PaymentGateway {
    private final PmsProperties.Razorpay cfg;
    private final RestClient http;

    public RazorpayGateway(PmsProperties.Razorpay cfg) {
        this.cfg = cfg;
        String basic = Base64.getEncoder().encodeToString((cfg.keyId() + ":" + cfg.keySecret()).getBytes(StandardCharsets.UTF_8));
        this.http = RestClient.builder().baseUrl("https://api.razorpay.com/v1").defaultHeader("Authorization", "Basic " + basic).build();
    }

    @Override public boolean enabled() { return true; }
    @Override public String name() { return "razorpay"; }
    @Override public String publicKey() { return cfg.keyId(); }

    @Override
    public String createOrder(long amountPaise, String receipt) {
        JsonNode order = http.post().uri("/orders").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountPaise, "currency", "INR", "receipt", receipt.length() > 40 ? receipt.substring(0, 40) : receipt))
                .retrieve().body(JsonNode.class);
        return order.get("id").asText();
    }

    @Override
    public boolean verifyCheckout(String orderId, String paymentId, String signature) {
        return matches(hmac(cfg.keySecret(), orderId + "|" + paymentId), signature);
    }

    @Override
    public boolean verifyWebhook(String body, String signature) {
        return cfg.webhookSecret() != null && !cfg.webhookSecret().isBlank() && matches(hmac(cfg.webhookSecret(), body), signature);
    }

    @Override
    public Payment fetchPayment(String paymentId) {
        JsonNode p = http.get().uri("/payments/{id}", paymentId).retrieve().body(JsonNode.class);
        // Most accounts auto-capture; one that does not leaves the money authorised until someone captures it.
        if ("authorized".equals(p.path("status").asText()))
            p = http.post().uri("/payments/{id}/capture", paymentId).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("amount", p.path("amount").asLong(), "currency", p.path("currency").asText("INR")))
                    .retrieve().body(JsonNode.class);
        return toPayment(p);
    }

    @Override
    public List<Payment> paymentsForOrder(String orderId) {
        JsonNode list = http.get().uri("/orders/{id}/payments", orderId).retrieve().body(JsonNode.class);
        List<Payment> out = new ArrayList<>();
        for (JsonNode p : list.path("items")) out.add(toPayment(p));
        return out;
    }

    @Override
    public String refund(String paymentId, long amountPaise) {
        JsonNode refund = http.post().uri("/payments/{id}/refund", paymentId).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountPaise)).retrieve().body(JsonNode.class);
        return refund.get("id").asText();
    }

    private static Payment toPayment(JsonNode p) {
        return new Payment(p.path("id").asText(), p.path("order_id").asText(null), p.path("amount").asLong(), p.path("currency").asText("INR"),
                p.path("status").asText(), p.path("method").asText(""), p.path("error_description").asText(null));
    }

    static String hmac(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static boolean matches(String expected, String given) {
        return given != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), given.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
    }
}
