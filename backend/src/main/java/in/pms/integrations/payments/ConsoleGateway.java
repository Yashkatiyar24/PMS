package in.pms.integrations.payments;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A gateway for development that behaves like Razorpay without moving money: it signs with a fixed secret, keeps
 * its orders and payments in memory, and lets a test (or the dev booking page) decide whether a payment succeeds.
 * The production safety check refuses to start with it.
 */
public class ConsoleGateway implements PaymentGateway {
    private static final Logger log = LoggerFactory.getLogger(ConsoleGateway.class);
    static final String SECRET = "console-gateway-secret";

    private final Map<String, Long> orders = new ConcurrentHashMap<>();
    private final Map<String, Payment> payments = new ConcurrentHashMap<>();

    @Override public boolean enabled() { return true; }
    @Override public String name() { return "console"; }
    @Override public String publicKey() { return "console"; }

    @Override
    public String createOrder(long amountPaise, String receipt) {
        String id = "order_console_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        orders.put(id, amountPaise);
        log.info("console gateway: order {} for {} paise ({})", id, amountPaise, receipt);
        return id;
    }

    /**
     * What the gateway's checkout would do: take (or fail) the payment and hand back the signed callback fields.
     * Only this simulator can do this; the real checkout runs in the gateway's own window.
     */
    public Map<String, String> simulate(String orderId, boolean succeed) {
        Long amount = orders.get(orderId);
        if (amount == null) throw new IllegalArgumentException("Unknown order");
        String paymentId = "pay_console_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        payments.put(paymentId, new Payment(paymentId, orderId, amount, "INR", succeed ? "captured" : "failed", "upi", succeed ? null : "Declined in the simulator"));
        return Map.of("orderId", orderId, "paymentId", paymentId, "signature", succeed ? RazorpayGateway.hmac(SECRET, orderId + "|" + paymentId) : "");
    }

    /** A webhook body as the gateway would sign it, for tests. */
    public String signWebhook(String body) { return RazorpayGateway.hmac(SECRET, body); }

    @Override public boolean verifyCheckout(String orderId, String paymentId, String signature) { return RazorpayGateway.matches(RazorpayGateway.hmac(SECRET, orderId + "|" + paymentId), signature); }
    @Override public boolean verifyWebhook(String body, String signature) { return RazorpayGateway.matches(RazorpayGateway.hmac(SECRET, body), signature); }

    @Override
    public Payment fetchPayment(String paymentId) {
        Payment p = payments.get(paymentId);
        if (p == null) throw new IllegalArgumentException("Unknown payment " + paymentId);
        return p;
    }

    @Override
    public List<Payment> paymentsForOrder(String orderId) {
        return new ArrayList<>(payments.values().stream().filter(p -> orderId.equals(p.orderId())).toList());
    }

    @Override
    public String refund(String paymentId, long amountPaise) {
        fetchPayment(paymentId);
        log.info("console gateway: refund {} paise of {}", amountPaise, paymentId);
        return "rfnd_console_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }
}
