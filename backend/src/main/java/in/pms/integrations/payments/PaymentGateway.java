package in.pms.integrations.payments;

import java.util.List;

/**
 * A card/UPI payment gateway. The browser only ever starts a payment; whether it happened is decided here, on
 * the server, by checking the gateway's signature with a secret the browser never sees and by asking the
 * gateway itself for the payment. Nothing the browser says about success is believed on its own.
 */
public interface PaymentGateway {
    /** False when online payment is switched off for this deployment. */
    boolean enabled();

    String name();

    /** What the browser needs to open the checkout: the public key only, never the secret. */
    String publicKey();

    /** An order for {@code amountPaise} INR. {@code receipt} is our own reference, shown in the gateway's dashboard. */
    String createOrder(long amountPaise, String receipt);

    /** The checkout's success callback: is {@code signature} the gateway's signature over this order and payment? */
    boolean verifyCheckout(String orderId, String paymentId, String signature);

    /** A webhook's body really came from the gateway. */
    boolean verifyWebhook(String body, String signature);

    /** The payment as the gateway sees it. A payment only authorised is captured here, so that it settles. */
    Payment fetchPayment(String paymentId);

    /** Every payment attempted against an order, for reconciliation. */
    List<Payment> paymentsForOrder(String orderId);

    /** Refund part or all of a captured payment; returns the gateway's refund id. */
    String refund(String paymentId, long amountPaise);

    /** @param status captured, failed, authorized, refunded or created, in the gateway's words. */
    record Payment(String id, String orderId, long amountPaise, String currency, String status, String method, String error) {
        public boolean captured() { return "captured".equals(status) || "refunded".equals(status); }
    }
}
