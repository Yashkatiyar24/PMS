package in.pms.payments;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.folio.Folio;
import in.pms.folio.FolioService;
import in.pms.integrations.payments.PaymentGateway;
import in.pms.money.Money;
import in.pms.notifications.Notifier;
import in.pms.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * Money taken online, from the order to the folio.
 *
 * <p>The browser starts a payment and reports back, but nothing it says is believed alone: a payment counts only
 * once the gateway's signature checks out with our secret <i>and</i> the gateway, asked directly, says the money
 * was captured for this order and amount. The same payment can then arrive three ways (the browser, the webhook,
 * reconciliation) and is recorded exactly once, by its gateway id.
 */
@Service
public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final JdbcClient jdbc;
    private final JdbcClient admin;
    private final PaymentGateway gateway;
    private final FolioService folios;
    private final BookingService bookings;
    private final AuditService audit;
    private final Notifier notifier;
    /** One transaction per order when reconciling, so one bad order cannot roll back the others. */
    private final TransactionTemplate eachOrder;

    public PaymentService(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient admin, PaymentGateway gateway, FolioService folios,
                          BookingService bookings, AuditService audit, Notifier notifier, @Qualifier("tenantTx") PlatformTransactionManager tenantTx) {
        this.jdbc = jdbc; this.admin = admin; this.gateway = gateway; this.folios = folios; this.bookings = bookings; this.audit = audit; this.notifier = notifier;
        this.eachOrder = new TransactionTemplate(tenantTx);
        this.eachOrder.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** What the browser needs to open the gateway's checkout. The key is the public one; the secret never leaves the server. */
    public record Checkout(String provider, String keyId, String orderId, long amountPaise, String currency, String name, OffsetDateTime holdUntil) {}
    public record Order(UUID id, UUID bookingId, String guestName, String gatewayOrderId, long amountPaise, String status, String gatewayPaymentId,
                        UUID paymentId, String failureReason, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

    public boolean enabled() { return gateway.enabled(); }

    /** Ask the gateway to collect {@code amountPaise} towards a booking's bill. */
    @Transactional
    public Checkout start(UUID bookingId, long amountPaise) {
        if (!gateway.enabled()) throw new BadRequestException("Online payment is not set up");
        if (amountPaise < 100) throw new BadRequestException("Amount is too small to pay online");
        Booking b = bookings.get(bookingId);
        if (!Set.of("pending", "reserved", "checked_in").contains(b.state())) throw new ConflictException("This booking is " + b.state());
        String receipt = bookingId.toString().substring(0, 8).toUpperCase();
        String orderId = gateway.createOrder(amountPaise, receipt);
        jdbc.sql("insert into payment_orders(property_id, folio_id, booking_id, gateway, gateway_order_id, amount_paise) values (?, ?, ?, ?, ?, ?)")
                .params(TenantContext.require(), b.folioId(), bookingId, gateway.name(), orderId, amountPaise).update();
        audit.record("payment_orders", orderId, "create", null, Map.of("bookingId", bookingId.toString(), "amountPaise", amountPaise), null);
        String property = jdbc.sql("select name from properties where id = ?").param(TenantContext.require()).query(String.class).single();
        return new Checkout(gateway.name(), gateway.publicKey(), orderId, amountPaise, "INR", property, b.holdUntil());
    }

    /** Pay again for the same booking after a failed or abandoned attempt, while it is still held. */
    @Transactional
    public Checkout retry(String previousOrderId) {
        Order previous = byGatewayOrder(previousOrderId);
        if ("paid".equals(previous.status())) throw new ConflictException("This booking is already paid");
        return start(previous.bookingId(), previous.amountPaise());
    }

    /** The checkout's success callback. Refused unless the signature is the gateway's; then the gateway is asked. */
    @Transactional
    public Order verifyCheckout(String gatewayOrderId, String gatewayPaymentId, String signature) {
        Order order = byGatewayOrder(gatewayOrderId);
        if (!gateway.verifyCheckout(gatewayOrderId, gatewayPaymentId, signature)) {
            audit.record("payment_orders", gatewayOrderId, "bad_signature", null, Map.of("paymentId", String.valueOf(gatewayPaymentId)), null);
            throw new ForbiddenException("The payment could not be verified");
        }
        return apply(order, gateway.fetchPayment(gatewayPaymentId));
    }

    /** The browser says the payment failed. Only a failure is taken on its word: it moves no money. */
    @Transactional
    public Order reportFailure(String gatewayOrderId, String reason) {
        Order order = byGatewayOrder(gatewayOrderId);
        if (!"created".equals(order.status())) return order;
        markFailed(order, reason == null || reason.isBlank() ? "Payment was not completed" : reason);
        return byGatewayOrder(gatewayOrderId);
    }

    /** A verified webhook for a payment: the property is known from the order, so this runs inside its tenant. */
    @Transactional
    public void applyFromGateway(String gatewayOrderId, String gatewayPaymentId) {
        apply(byGatewayOrder(gatewayOrderId), gateway.fetchPayment(gatewayPaymentId));
    }

    /** Which property an order belongs to, read on the admin role because a webhook arrives with no session. */
    @Transactional(value = "adminTx", readOnly = true)
    public Optional<UUID> propertyOfOrder(String gatewayOrderId) {
        return admin.sql("select property_id from payment_orders where gateway_order_id = ?").param(gatewayOrderId).query(UUID.class).optional();
    }

    public boolean verifyWebhook(String body, String signature) { return gateway.verifyWebhook(body, signature); }

    /**
     * Ask the gateway about orders still waiting: ones older than a few minutes, and every one whose booking's
     * hold has run out. A failed attempt stays in the list while its booking is still held, because the guest can
     * retry in the same gateway window and succeed on the same order. Run before holds expire, so a guest who
     * paid in the last minute keeps their room. Each order is its own transaction.
     */
    public int reconcileWaiting() {
        if (!gateway.enabled()) return 0;
        List<Order> waiting = eachOrder.execute(tx -> jdbc.sql(SELECT + """
                 where o.property_id = ? and (o.status = 'created' or (o.status = 'failed' and b.state = 'pending'))
                   and (o.created_at < now() - interval '5 minutes' or b.hold_until < now())
                 order by o.created_at limit 50""").param(TenantContext.require()).query(this::map).list());
        int applied = 0;
        for (Order o : waiting) {
            try { applied += Boolean.TRUE.equals(eachOrder.execute(tx -> reconcile(o))) ? 1 : 0; }
            catch (Exception e) { log.warn("Could not reconcile payment order {}: {}", o.gatewayOrderId(), e.toString()); }
        }
        return applied;
    }

    /** One order, checked with the gateway now (the desk's "check with gateway" button). */
    @Transactional
    public Order check(UUID id) {
        Order o = jdbc.sql(SELECT + " where o.id = ? and o.property_id = ?").params(id, TenantContext.require()).query(this::map).optional()
                .orElseThrow(() -> new NotFoundException("Payment"));
        if (!gateway.enabled()) throw new BadRequestException("Online payment is not set up");
        reconcile(o);
        return byGatewayOrder(o.gatewayOrderId());
    }

    /** Orders over a period, with what the folio recorded for each, for the accountant to tick off against the gateway. */
    @Transactional(readOnly = true)
    public List<Order> orders(OffsetDateTime from, OffsetDateTime to) {
        return jdbc.sql(SELECT + " where o.property_id = ? and o.created_at >= ? and o.created_at < ? order by o.created_at desc limit 500")
                .params(TenantContext.require(), from, to).query(this::map).list();
    }

    /**
     * Give money back to the card or UPI it came from. The gateway refunds first; only then is the refund recorded,
     * against the payment it came out of, so the same payment can never be refunded beyond what it brought in.
     */
    @Transactional
    public Folio refund(UUID folioId, long amountPaise, String reason, UUID userId, UUID approvedBy) {
        if (amountPaise <= 0) throw new BadRequestException("Refund amount must be positive");
        if (reason == null || reason.isBlank()) throw new BadRequestException("A reason is required for a refund");
        // Every check the folio will make is made before the gateway moves any money: a refund that would then be
        // refused here would otherwise leave the property with money paid out and nothing on the books.
        if (amountPaise > folios.get(folioId).paidPaise()) throw new BadRequestException("Refund exceeds the amount paid");
        var candidates = jdbc.sql("""
                select p.id, p.gateway_payment_id, p.amount_paise + coalesce((select sum(r.amount_paise) from payments r where r.refund_of = p.id), 0) as refundable
                from payments p where p.folio_id = ? and p.property_id = ? and p.mode = 'online' and not p.is_refund and p.gateway_payment_id is not null
                order by p.received_at desc""").params(folioId, TenantContext.require()).query().listOfRows();
        var from = candidates.stream().filter(r -> ((Number) r.get("refundable")).longValue() >= amountPaise).findFirst()
                .orElseThrow(() -> new BadRequestException("No online payment on this bill has " + Money.format(amountPaise) + " left to refund"));
        String refundId = gateway.refund((String) from.get("gateway_payment_id"), amountPaise);
        return folios.refund(folioId, new FolioService.PaymentInput("online", amountPaise, refundId, null, reason, null), userId, approvedBy, (UUID) from.get("id"));
    }

    // ---------- Internals ----------

    private boolean reconcile(Order o) {
        List<PaymentGateway.Payment> attempts = gateway.paymentsForOrder(o.gatewayOrderId());
        var captured = attempts.stream().filter(PaymentGateway.Payment::captured).findFirst();
        if (captured.isPresent()) { apply(o, captured.get()); return true; }
        var failed = attempts.stream().filter(p -> "failed".equals(p.status())).findFirst();
        if (failed.isPresent() && "created".equals(o.status())) { markFailed(o, failed.get().error()); return true; }
        // Nothing paid and the booking has let its rooms go: the order will never be paid for.
        Booking b = bookings.get(o.bookingId());
        if (b.holdUntil() != null && b.holdUntil().isBefore(OffsetDateTime.now()) && attempts.isEmpty())
            jdbc.sql("update payment_orders set status = 'expired', updated_at = now() where id = ? and property_id = ? and status = 'created'").params(o.id(), TenantContext.require()).update();
        return false;
    }

    /** What the gateway says about a payment, applied once: money recorded, the booking confirmed or flagged. */
    private Order apply(Order order, PaymentGateway.Payment p) {
        if (p.orderId() != null && !order.gatewayOrderId().equals(p.orderId())) throw new ForbiddenException("That payment is for another order");
        if (p.captured()) {
            if (!"INR".equals(p.currency())) throw new ForbiddenException("Unexpected currency " + p.currency());
            // Hold the booking while the money is recorded, so the hold-expiry job cannot cancel it in between.
            String state = bookings.lockState(order.bookingId());
            UUID paymentId = folios.recordGatewayPayment(orderFolio(order), p.amountPaise(), p.id());
            jdbc.sql("update payment_orders set status = 'paid', gateway_payment_id = ?, payment_id = ?, failure_reason = null, updated_at = now() where id = ? and property_id = ?")
                    .params(p.id(), paymentId, order.id(), TenantContext.require()).update();
            Booking b = bookings.get(order.bookingId());
            if ("pending".equals(state) && p.amountPaise() >= order.amountPaise()) bookings.confirm(b.id(), null);
            else if (Set.of("cancelled", "no_show").contains(b.state()))
                // The money is real even if the hold ran out: say so, and let a person refund or reinstate.
                notifier.notify("payment_after_expiry", "Paid after the booking lapsed: " + b.guestName(),
                        Money.format(p.amountPaise()) + " · refund or rebook", "/stays/" + b.id(), Permissions.REVENUE_VIEW);
            if (p.amountPaise() < order.amountPaise())
                notifier.notify("payment_short", "Part payment online: " + b.guestName(), Money.format(p.amountPaise()) + " of " + Money.format(order.amountPaise()),
                        "/stays/" + b.id(), Permissions.REVENUE_VIEW);
        } else if ("failed".equals(p.status()) && "created".equals(order.status())) {
            markFailed(order, p.error());
        }
        return byGatewayOrder(order.gatewayOrderId());
    }

    private void markFailed(Order order, String reason) {
        jdbc.sql("update payment_orders set status = 'failed', failure_reason = ?, updated_at = now() where id = ? and property_id = ? and status = 'created'")
                .params(reason == null ? "Payment failed" : reason.length() > 300 ? reason.substring(0, 300) : reason, order.id(), TenantContext.require()).update();
        audit.record("payment_orders", order.gatewayOrderId(), "failed", null, Map.of("reason", String.valueOf(reason)), null);
        notifier.notify("payment_failed", "Online payment failed: " + String.valueOf(order.guestName()), Money.format(order.amountPaise()) + (reason == null ? "" : " · " + reason),
                "/stays/" + order.bookingId(), Permissions.CHECKIN);
    }

    private UUID orderFolio(Order order) {
        return jdbc.sql("select folio_id from payment_orders where id = ? and property_id = ?").params(order.id(), TenantContext.require()).query(UUID.class).single();
    }

    private Order byGatewayOrder(String gatewayOrderId) {
        return jdbc.sql(SELECT + " where o.gateway_order_id = ? and o.property_id = ?").params(gatewayOrderId, TenantContext.require()).query(this::map).optional()
                .orElseThrow(() -> new NotFoundException("Payment"));
    }

    private static final String SELECT = """
            select o.*, g.name as guest_name from payment_orders o join bookings b on b.id = o.booking_id join guests g on g.id = b.guest_id
            """;

    private Order map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Order(rs.getObject("id", UUID.class), rs.getObject("booking_id", UUID.class), rs.getString("guest_name"), rs.getString("gateway_order_id"),
                rs.getLong("amount_paise"), rs.getString("status"), rs.getString("gateway_payment_id"), rs.getObject("payment_id", UUID.class),
                rs.getString("failure_reason"), rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class));
    }
}
