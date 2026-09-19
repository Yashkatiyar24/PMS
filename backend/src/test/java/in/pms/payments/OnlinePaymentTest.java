package in.pms.payments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.booking.BookingService;
import in.pms.folio.FolioService;
import in.pms.integrations.payments.ConsoleGateway;
import in.pms.integrations.payments.PaymentGateway;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A guest pays online on the booking page. The browser is never believed: a forged signature books nothing, a
 * replayed success records the money once, the webhook and the browser agree, and an unpaid hold lets its room go.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "pms.payments.provider=console")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OnlinePaymentTest {
    @Autowired MockMvc mvc;
    @Autowired PaymentGateway gateway;
    @Autowired PaymentService payments;
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;
    final ObjectMapper json = new ObjectMapper();

    UUID org, property, type;
    final String slug = "gateway-test-" + UUID.randomUUID().toString().substring(0, 6);
    final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Gateway Trust') returning id").query(UUID.class).single();
            property = admin.sql("""
                    insert into properties(org_id, name, timezone, booking_slug, settings) values (?, 'Gateway Test', 'Asia/Kolkata', ?,
                      '{"online_booking_enabled":true,"online_payment":"required","online_payment_advance_pct":50,"consent_required":false}'::jsonb) returning id""")
                    .params(org, slug).query(UUID.class).single();
            type = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Std', 100000, 3) returning id").param(property).query(UUID.class).single();
            for (String n : List.of("101", "102", "103", "104"))
                admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, ?)").params(property, type, n).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("update payment_orders set payment_id = null where property_id = ?").param(property).update();
            admin.sql("update payments set refund_of = null where property_id = ?").param(property).update();
            for (String t : List.of("payment_orders", "payments", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    JsonNode call(String path, Object body, int expected) throws Exception {
        String res = mvc.perform(post("/api/public/book/" + slug + path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return res.isBlank() ? null : json.readTree(res);
    }

    JsonNode book(int fromDay, String phone) throws Exception {
        return call("", Map.ofEntries(Map.entry("roomTypeId", type), Map.entry("arrive", today.plusDays(fromDay).toString()),
                Map.entry("depart", today.plusDays(fromDay + 2).toString()), Map.entry("adults", 2), Map.entry("children", 0), Map.entry("name", "Online Guest"),
                Map.entry("phone", phone), Map.entry("city", "Pune"), Map.entry("consent", true), Map.entry("whatsappOptIn", false),
                Map.entry("clientUuid", UUID.randomUUID())), 200);
    }

    UUID bookingOf(String orderId) {
        return admin.sql("select booking_id from payment_orders where gateway_order_id = ?").param(orderId).query(UUID.class).single();
    }

    @Test
    void aVerifiedPaymentConfirmsTheBookingAndAForgedOneDoesNothing() throws Exception {
        JsonNode booked = book(5, "9800000011");
        assertThat(booked.get("status").asText()).isEqualTo("pending");
        String orderId = booked.path("payment").path("orderId").asText();
        assertThat(booked.path("payment").path("amountPaise").asLong()).isEqualTo(100000); // half of 2 nights × ₹1,000

        // A forged success: the right ids with a made-up signature.
        Map<String, String> real = ((ConsoleGateway) gateway).simulate(orderId, true);
        call("/payments/verify", Map.of("orderId", orderId, "paymentId", real.get("paymentId"), "signature", "0".repeat(64)), 403);
        assertThat(desk(() -> bookings.get(bookingOf(orderId))).state()).isEqualTo("pending");

        // The real one, twice (a double tap, or a retry after a dropped connection): confirmed, and paid once.
        JsonNode confirmed = call("/payments/verify", real, 200);
        assertThat(confirmed.get("status").asText()).isEqualTo("reserved");
        call("/payments/verify", real, 200);
        UUID bookingId = bookingOf(orderId);
        var folio = desk(() -> folios.forBooking(bookingId));
        assertThat(folio.payments()).singleElement().satisfies(p -> {
            assertThat(p.mode()).isEqualTo("online");
            assertThat(p.amountPaise()).isEqualTo(100000);
        });

        // The gateway's webhook for the same payment changes nothing more.
        String event = json.writeValueAsString(Map.of("event", "payment.captured", "payload", Map.of("payment", Map.of("entity",
                Map.of("id", real.get("paymentId"), "order_id", orderId, "status", "captured")))));
        mvc.perform(post("/api/public/payments/webhook").contentType(MediaType.APPLICATION_JSON).content(event)
                .header("X-Razorpay-Signature", ((ConsoleGateway) gateway).signWebhook(event))).andExpect(status().isNoContent());
        mvc.perform(post("/api/public/payments/webhook").contentType(MediaType.APPLICATION_JSON).content(event)
                .header("X-Razorpay-Signature", "forged")).andExpect(status().isForbidden());
        assertThat(desk(() -> folios.forBooking(bookingId)).payments()).hasSize(1);

        // Refunds go back through the gateway and never beyond what came in, checked before the gateway moves money.
        assertThatThrownBy(() -> desk(() -> payments.refund(folio.id(), 100001, "More than was paid", null, null))).hasMessageContaining("exceeds");
        desk(() -> payments.refund(folio.id(), 40000, "Changed plans", null, null));
        assertThatThrownBy(() -> desk(() -> payments.refund(folio.id(), 70000, "Too much", null, null))).hasMessageContaining("exceeds");
        assertThatThrownBy(() -> desk(() -> folios.refund(folio.id(), new FolioService.PaymentInput("online", 100, "", null, "x", null), null, null)))
                .hasMessageContaining("through the gateway");
        assertThat(desk(() -> folios.forBooking(bookingId)).paidPaise()).isEqualTo(60000);
    }

    @Test
    void onlyTheWebhookArrivesAndTheBookingIsStillConfirmed() throws Exception {
        String orderId = book(10, "9800000012").path("payment").path("orderId").asText();
        Map<String, String> paid = ((ConsoleGateway) gateway).simulate(orderId, true);
        String event = json.writeValueAsString(Map.of("event", "payment.captured", "payload", Map.of("payment", Map.of("entity",
                Map.of("id", paid.get("paymentId"), "order_id", orderId)))));
        mvc.perform(post("/api/public/payments/webhook").contentType(MediaType.APPLICATION_JSON).content(event)
                .header("X-Razorpay-Signature", ((ConsoleGateway) gateway).signWebhook(event))).andExpect(status().isNoContent());
        assertThat(desk(() -> bookings.get(bookingOf(orderId))).state()).isEqualTo("reserved");
    }

    @Test
    void aFailedAttemptCanBeRetriedAndAnUnpaidHoldLetsTheRoomGo() throws Exception {
        String orderId = book(20, "9800000013").path("payment").path("orderId").asText();
        ((ConsoleGateway) gateway).simulate(orderId, false);
        call("/payments/failed", Map.of("orderId", orderId, "reason", "Card declined"), 204);
        assertThat(admin.sql("select status from payment_orders where gateway_order_id = ?").param(orderId).query(String.class).single()).isEqualTo("failed");
        assertThat(admin.sql("select count(*) from notifications where property_id = ? and kind = 'payment_failed'").param(property).query(Integer.class).single()).isPositive();

        JsonNode retry = call("/payments/retry", Map.of("orderId", orderId), 200);
        assertThat(retry.get("orderId").asText()).isNotEqualTo(orderId);

        // Nobody pays; the hold runs out. Reconciliation finds nothing, and the room is released.
        UUID bookingId = bookingOf(orderId);
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update bookings set hold_until = now() - interval '1 minute' where id = ?").param(bookingId).update());
        desk(() -> payments.reconcileWaiting());
        desk(() -> bookings.expireHolds());
        assertThat(desk(() -> bookings.get(bookingId)).state()).isEqualTo("cancelled");
        assertThat(admin.sql("select status from payment_orders where gateway_order_id = ?").param(retry.get("orderId").asText()).query(String.class).single()).isEqualTo("expired");
    }

    @Test
    void aPaymentTheBrowserNeverReportedIsFoundByReconciliationBeforeTheHoldLapses() throws Exception {
        String orderId = book(30, "9800000014").path("payment").path("orderId").asText();
        ((ConsoleGateway) gateway).simulate(orderId, true);    // paid, but the phone lost signal before reporting it
        UUID bookingId = bookingOf(orderId);
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update bookings set hold_until = now() - interval '1 minute' where id = ?").param(bookingId).update());
        desk(() -> payments.reconcileWaiting());
        desk(() -> bookings.expireHolds());
        assertThat(desk(() -> bookings.get(bookingId)).state()).isEqualTo("reserved");
    }
}
