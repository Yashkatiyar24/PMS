package in.pms.integrations.payments;

import java.util.List;

/** Online payment switched off for this deployment: guests pay at the property, as before. */
public class DisabledGateway implements PaymentGateway {
    private static UnsupportedOperationException off() { return new UnsupportedOperationException("Online payment is not set up"); }

    @Override public boolean enabled() { return false; }
    @Override public String name() { return "none"; }
    @Override public String publicKey() { return ""; }
    @Override public String createOrder(long amountPaise, String receipt) { throw off(); }
    @Override public boolean verifyCheckout(String orderId, String paymentId, String signature) { return false; }
    @Override public boolean verifyWebhook(String body, String signature) { return false; }
    @Override public Payment fetchPayment(String paymentId) { throw off(); }
    @Override public List<Payment> paymentsForOrder(String orderId) { return List.of(); }
    @Override public String refund(String paymentId, long amountPaise) { throw off(); }
}
