package in.pms.booking;

import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.guests.GuestService;
import in.pms.reports.ReportService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The calendar's drag to move, the dashboard's forecast, and the search box. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CalendarAndDashboardTest {

    @Autowired BookingService bookings;
    @Autowired ReportService reports;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    final LocalDate today = LocalDate.now(ZONE);
    UUID orgId, property, stdType, suiteType, room101, room102, room103, room104, suite201;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Calendar Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone) values (?, 'Calendar Test', 'Asia/Kolkata') returning id").param(orgId).query(UUID.class).single();
            stdType = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Std', 100000, 3) returning id").param(property).query(UUID.class).single();
            suiteType = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Suite', 250000, 3) returning id").param(property).query(UUID.class).single();
            room101 = room(stdType, "101");
            room102 = room(stdType, "102");
            room103 = room(stdType, "103");
            room104 = room(stdType, "104");
            suite201 = room(suiteType, "201");
        });
    }

    UUID room(UUID type, String number) {
        return admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, ?) returning id").params(property, type, number).query(UUID.class).single();
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("receipts", "receipt_counters", "payments", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    <T> T as(Supplier<T> body) { return TenantContext.runAs(property, body); }

    Booking reserve(UUID room, String guest, String phone, int fromDay, int nights) {
        OffsetDateTime arrive = today.plusDays(fromDay).atTime(14, 0).atZone(ZONE).toOffsetDateTime();
        OffsetDateTime depart = today.plusDays(fromDay + nights).atTime(10, 0).atZone(ZONE).toOffsetDateTime();
        return as(() -> bookings.reserve(new BookingService.ReservationRequest(null,
                new GuestService.GuestInput(guest, phone, "", "", "IN", null, null, null, null, null, ""),
                null, List.of(new BookingService.UnitRequest(room, null, null)), arrive, depart, 1, 0, null, null, true, false, null, null, null), null));
    }

    @Test
    void draggingAReservationKeepsItsNightsAndTimes() {
        Booking b = reserve(room101, "Move Me", "", 5, 2);
        Booking moved = as(() -> bookings.move(b.id(), b.units().getFirst().id(), room102, null, today.plusDays(8), null));

        assertThat(moved.arriveAt().atZoneSameInstant(ZONE).toLocalDate()).isEqualTo(today.plusDays(8));
        assertThat(moved.departAt().atZoneSameInstant(ZONE).toLocalDate()).isEqualTo(today.plusDays(10));
        assertThat(moved.arriveAt().atZoneSameInstant(ZONE).getHour()).isEqualTo(14);
        assertThat(moved.units().getFirst().roomNumber()).isEqualTo("102");
        assertThat(moved.units().getFirst().ratePaise()).as("same kind of room keeps the agreed rate").isEqualTo(100000);

        Booking upgraded = as(() -> bookings.move(b.id(), moved.units().getFirst().id(), suite201, null, null, null));
        assertThat(upgraded.units().getFirst().ratePaise()).as("another kind of room takes its rate").isEqualTo(250000);
    }

    @Test
    void aMoveOntoATakenRoomOrIntoThePastIsRefused() {
        Booking first = reserve(room103, "Holder", "", 20, 2);
        Booking second = reserve(room104, "Mover", "", 20, 2);
        assertThatThrownBy(() -> as(() -> bookings.move(second.id(), second.units().getFirst().id(), room103, null, null, null)))
                .isInstanceOf(ConflictException.class).hasMessageContaining("already taken");
        assertThatThrownBy(() -> as(() -> bookings.move(second.id(), null, null, null, today.minusDays(1), null)))
                .isInstanceOf(BadRequestException.class);
        assertThat(first.id()).isNotNull();
    }

    @Test
    void anArrivedGuestChangesRoomButNotDates() {
        Booking b = reserve(room104, "Arrived", "", 0, 1);
        as(() -> bookings.arrive(b.id(), null));
        assertThatThrownBy(() -> as(() -> bookings.move(b.id(), null, null, null, today.plusDays(1), null)))
                .isInstanceOf(ConflictException.class).hasMessageContaining("another room");
        Booking moved = as(() -> bookings.move(b.id(), b.units().getFirst().id(), room103, null, null, null));
        assertThat(moved.units().getFirst().roomNumber()).isEqualTo("103");
    }

    @Test
    void theForecastCountsNightsAndPricesThem() {
        // Two nights in 101, far enough out that no other test's stays fall in the window.
        reserve(room101, "Forecast", "", 40, 2);
        Map<String, Object> f = as(() -> reports.forecast(today.plusDays(40), 4));

        assertThat(f.get("units")).isEqualTo(5L);
        assertThat(f.get("roomNights")).isEqualTo(2L);
        assertThat(f.get("revenuePaise")).isEqualTo(200000L);
        assertThat(f.get("adrPaise")).isEqualTo(100000L);
        assertThat(f.get("revparPaise")).isEqualTo(10000L);        // 200000 over 5 units × 4 nights
        assertThat(f.get("occupancyPct")).isEqualTo(10.0);
        assertThat((List<?>) f.get("nights")).hasSize(4);
    }

    @Test
    void searchFindsAStayByNamePhoneOrReference() {
        Booking b = reserve(room102, "Kamla Prasad", "9811122233", 60, 1);
        assertThat(as(() -> bookings.search("kamla"))).extracting(BookingService.SearchHit::id).contains(b.id());
        assertThat(as(() -> bookings.search("22233"))).extracting(BookingService.SearchHit::id).contains(b.id());
        assertThat(as(() -> bookings.search(b.id().toString().substring(0, 8).toUpperCase()))).extracting(BookingService.SearchHit::id).contains(b.id());
        assertThat(as(() -> bookings.search("k"))).as("one letter is not a search").isEmpty();
    }
}
