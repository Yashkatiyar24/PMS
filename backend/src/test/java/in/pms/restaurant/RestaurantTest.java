package in.pms.restaurant;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.common.ConflictException;
import in.pms.folio.Folio;
import in.pms.folio.FolioService;
import in.pms.guests.GuestService;
import in.pms.reports.ReportService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Room 204 orders food worth ₹850: it lands on the guest's bill. A walk-in diner pays at the counter and gets a numbered bill. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RestaurantTest {
    @Autowired RestaurantService restaurant;
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired ReportService reports;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID org, property, room204;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Kitchen Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, gstin, timezone, settings) values (?, 'Kitchen Test', '09AAACH7409R1ZZ', 'Asia/Kolkata', '{\"id_photo_required\":false,\"receipt_prefix\":\"KT\"}'::jsonb) returning id")
                    .param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room204 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '204') returning id").params(property, type).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("payments", "pos_order_lines", "pos_orders", "menu_items", "receipt_counters", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    @Test
    void foodOrderedToRoom204AppearsOnTheGuestsBill() {
        Booking stay = desk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, new GuestService.GuestInput("Room Guest", "", "", "", "IN", null, null, null, null, null, ""),
                List.of(new BookingService.UnitRequest(room204, null, null)), 1, null, 1, 0, null, null, "", true, false, null, null, null, null, null), null));
        var thali = desk(() -> restaurant.saveMenuItem(null, new RestaurantService.MenuInput("Thali", "Meals", 42500, null, null), null));

        var order = desk(() -> restaurant.create(new RestaurantService.OrderInput(stay.id(), "", List.of(new RestaurantService.LineInput(thali.id(), null, null, 2))), null));
        assertThat(order.taxablePaise()).isEqualTo(85000);   // ₹850
        assertThat(order.taxRateBp()).isEqualTo(500);        // the restaurant's rate, not the room slab
        var posted = desk(() -> restaurant.postToRoom(order.id(), null, null));
        assertThat(posted.status()).isEqualTo("posted");

        Folio folio = desk(() -> folios.get(stay.folioId()));
        assertThat(folio.lines()).filteredOn(l -> "restaurant".equals(l.category())).singleElement().satisfies(l -> {
            assertThat(l.amountPaise()).isEqualTo(85000);
            assertThat(l.cgstPaise() + l.sgstPaise()).isEqualTo(4250);
        });
        // It cannot be settled twice.
        assertThatThrownBy(() -> desk(() -> restaurant.pay(order.id(), "cash", null, null))).isInstanceOf(ConflictException.class);
    }

    @Test
    void aWalkInDinerPaysAtTheCounterAndTheDayCountsIt() throws Exception {
        var order = desk(() -> restaurant.create(new RestaurantService.OrderInput(null, "Table 3",
                List.of(new RestaurantService.LineInput(null, "Masala chai", 3000L, 4))), null));
        var paid = desk(() -> restaurant.pay(order.id(), "upi", "UPI/77", null));
        assertThat(paid.status()).isEqualTo("paid");
        assertThat(paid.billNumber()).contains("KTB");
        assertThat(paid.totalPaise()).isEqualTo(12600);      // ₹120 + 5%

        Map<String, Object> day = desk(() -> reports.daily(null));
        assertThat(((Number) day.get("collectedPaise")).longValue()).isGreaterThanOrEqualTo(12600);
        var month = desk(() -> reports.month(YearMonth.now(ZoneId.of("Asia/Kolkata"))));
        assertThat(month.get("taxableByRate").toString()).contains("taxable=12000");

        // Two quick taps on Pay settle an order once: one payment, one bill number.
        var twice = desk(() -> restaurant.create(new RestaurantService.OrderInput(null, "Table 4", List.of(new RestaurantService.LineInput(null, "Dosa", 8000L, 1))), null));
        try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var start = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Object> tap = () -> { start.await(); try { return desk(() -> restaurant.pay(twice.id(), "cash", null, null)); } catch (Exception e) { return e; } };
            var a = pool.submit(tap); var b = pool.submit(tap);
            start.countDown();
            List<Object> results = List.of(a.get(30, java.util.concurrent.TimeUnit.SECONDS), b.get(30, java.util.concurrent.TimeUnit.SECONDS));
            assertThat(results).filteredOn(r -> r instanceof RestaurantService.Order).hasSize(1);
        }
        assertThat(admin.sql("select count(*) from payments where pos_order_id = ?").param(twice.id()).query(Integer.class).single()).isEqualTo(1);

        // An order for someone who is not staying cannot go to a room.
        var stray = desk(() -> restaurant.create(new RestaurantService.OrderInput(null, "", List.of(new RestaurantService.LineInput(null, "Lassi", 5000L, 1))), null));
        assertThatThrownBy(() -> desk(() -> restaurant.postToRoom(stray.id(), UUID.randomUUID(), null))).hasMessageContaining("Booking");
    }
}
