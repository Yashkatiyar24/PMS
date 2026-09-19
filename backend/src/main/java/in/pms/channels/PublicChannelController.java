package in.pms.channels;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.integrations.payments.ConsoleGateway;
import in.pms.integrations.payments.PaymentGateway;
import in.pms.payments.PaymentService;
import in.pms.settings.SettingsService;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.selfreg.PublicRateLimiter;
import in.pms.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The two doors an OTA or a guest opens with no login.
 *
 * <ul>
 *   <li>{@code /calendar/{token}.ics} — one room's busy nights, for an OTA to import. The token is the whole
 *       credential and reveals dates only.</li>
 *   <li>{@code /book/{slug}} — the property's booking page. It answers only while the owner has online booking
 *       switched on; otherwise it is a 404, the same as a page that never existed.</li>
 * </ul>
 * Both are rate-limited per caller address, and booking has a much smaller allowance of its own.
 */
@RestController
@RequestMapping("/api/public")
public class PublicChannelController {
    private final ChannelService channels;
    private final OnlineBookingService online;
    private final BookingService bookings;
    private final PublicRateLimiter limiter;
    private final PaymentService payments;
    private final SettingsService settings;
    private final PaymentGateway gateway;

    public PublicChannelController(ChannelService channels, OnlineBookingService online, BookingService bookings, PublicRateLimiter limiter,
                                   PaymentService payments, SettingsService settings, PaymentGateway gateway) {
        this.channels = channels; this.online = online; this.bookings = bookings; this.limiter = limiter;
        this.payments = payments; this.settings = settings; this.gateway = gateway;
    }

    /** OTAs often insist the address ends in ".ics", so the suffix is accepted and ignored. */
    @GetMapping("/calendar/{token}")
    public ResponseEntity<String> calendar(@PathVariable String token, HttpServletRequest req) {
        if (!limiter.allow(req.getRemoteAddr())) throw new ForbiddenException("Too many requests; please wait a minute");
        String bare = token.endsWith(".ics") ? token.substring(0, token.length() - 4) : token;
        var link = channels.resolveExport(bare).orElseThrow(() -> new NotFoundException("Calendar"));
        String body = TenantContext.runAs(link.propertyId(), () -> channels.exportCalendar(link.linkId()));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/calendar; charset=utf-8"))
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }

    @GetMapping("/book/{slug}")
    public ResponseEntity<OnlineBookingService.Page> page(@PathVariable String slug, HttpServletRequest req) {
        UUID property = open(slug, req);
        return noStore(TenantContext.runAs(property, online::page));
    }

    @GetMapping("/book/{slug}/availability")
    public ResponseEntity<List<OnlineBookingService.Offer>> availability(@PathVariable String slug, HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate arrive,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate depart) {
        UUID property = open(slug, req);
        return noStore(TenantContext.runAs(property, () -> online.offers(arrive, depart)));
    }

    @PostMapping("/book/{slug}")
    public ResponseEntity<OnlineBookingService.Confirmation> book(@PathVariable String slug, HttpServletRequest req,
                                                                  @RequestBody BookingService.OnlineRequest in) {
        UUID property = open(slug, req);
        if (!limiter.allow("book:" + req.getRemoteAddr(), 5)) throw new ForbiddenException("Too many bookings from this connection; please call the property");
        return noStore(TenantContext.runAs(property, () -> {
            // Required, or optional and the guest chose to: the booking waits, pending, for a verified payment.
            String mode = online.paymentMode(settings.current());
            boolean pay = "required".equals(mode) || ("optional".equals(mode) && Boolean.TRUE.equals(in.payNow()));
            Booking booked = bookings.reserveOnline(in, pay);
            var confirmation = online.confirmation(booked);
            if (!pay || !"pending".equals(booked.state())) return confirmation; // a replayed request finds the booking as it now is
            long advance = Math.max(100, (booked.totalPaise() * settings.current().onlinePaymentAdvancePct() + 99) / 100);
            return confirmation.withPayment(payments.start(booked.id(), advance));
        }));
    }

    public record VerifyInput(String orderId, String paymentId, String signature) {}
    public record FailureInput(String orderId, String reason) {}
    public record SimulateInput(String orderId, boolean succeed) {}

    /**
     * The gateway's checkout says the guest paid. Believed only after the signature is checked with our secret and
     * the gateway confirms the payment; then the booking is confirmed and the guest sees it.
     */
    @PostMapping("/book/{slug}/payments/verify")
    public ResponseEntity<OnlineBookingService.Confirmation> verify(@PathVariable String slug, HttpServletRequest req, @RequestBody VerifyInput in) {
        UUID property = open(slug, req);
        return noStore(TenantContext.runAs(property, () -> {
            var order = payments.verifyCheckout(in.orderId(), in.paymentId(), in.signature());
            return online.confirmation(bookings.get(order.bookingId()));
        }));
    }

    /** The guest closed the checkout or it failed. Recorded so the desk can see it; the booking stays held until it lapses. */
    @PostMapping("/book/{slug}/payments/failed")
    public ResponseEntity<Void> failed(@PathVariable String slug, HttpServletRequest req, @RequestBody FailureInput in) {
        UUID property = open(slug, req);
        TenantContext.runAs(property, () -> payments.reportFailure(in.orderId(), in.reason()));
        return ResponseEntity.noContent().build();
    }

    /** Try paying again for the same held booking. */
    @PostMapping("/book/{slug}/payments/retry")
    public ResponseEntity<PaymentService.Checkout> retry(@PathVariable String slug, HttpServletRequest req, @RequestBody FailureInput in) {
        UUID property = open(slug, req);
        if (!limiter.allow("pay:" + req.getRemoteAddr(), 10)) throw new ForbiddenException("Too many attempts; please call the property");
        return noStore(TenantContext.runAs(property, () -> payments.retry(in.orderId())));
    }

    /** Development only: what the gateway's own window would do. Absent unless the simulator is the gateway. */
    @PostMapping("/book/{slug}/payments/simulate")
    public ResponseEntity<java.util.Map<String, String>> simulate(@PathVariable String slug, HttpServletRequest req, @RequestBody SimulateInput in) {
        if (!(gateway instanceof ConsoleGateway console)) throw new NotFoundException("Not found");
        UUID property = open(slug, req);
        if (!payments.propertyOfOrder(in.orderId()).map(property::equals).orElse(false)) throw new NotFoundException("Payment");
        return noStore(console.simulate(in.orderId(), in.succeed()));
    }

    /**
     * The gateway telling us about a payment, server to server. The signature over the raw body is the only
     * credential; the payment itself is then fetched from the gateway rather than read from the message.
     */
    @PostMapping("/payments/webhook")
    public ResponseEntity<Void> webhook(@RequestBody String body, @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        if (signature == null || !payments.verifyWebhook(body, signature)) throw new ForbiddenException("Bad signature");
        com.fasterxml.jackson.databind.JsonNode event;
        try { event = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body); }
        catch (Exception e) { throw new in.pms.common.BadRequestException("Unreadable event"); }
        var payment = event.path("payload").path("payment").path("entity");
        String orderId = payment.path("order_id").asText(""), paymentId = payment.path("id").asText("");
        if (orderId.isEmpty() || paymentId.isEmpty()) return ResponseEntity.noContent().build(); // refunds and others: nothing to apply
        var property = payments.propertyOfOrder(orderId);
        if (property.isEmpty()) return ResponseEntity.noContent().build();                    // not an order of ours
        TenantContext.runAs(property.get(), () -> payments.applyFromGateway(orderId, paymentId));
        return ResponseEntity.noContent().build();
    }

    /** Rate-limit, then resolve. Unknown, inactive and switched-off pages all answer the same 404. */
    private UUID open(String slug, HttpServletRequest req) {
        if (!limiter.allow(req.getRemoteAddr())) throw new ForbiddenException("Too many requests; please wait a minute");
        UUID property = channels.resolveSlug(slug).orElseThrow(() -> new NotFoundException("This booking page is not available"));
        if (!TenantContext.runAs(property, online::enabled)) throw new NotFoundException("This booking page is not available");
        return property;
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
