package in.pms.reports;

import in.pms.booking.BookingService;
import in.pms.expenses.ExpenseService;
import in.pms.folio.FolioService;
import in.pms.guests.GuestService;
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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The owner's report over a range of days adds up to what the desk did in it. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PeriodReportTest {
    @Autowired PeriodReportService period;
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired ExpenseService expenses;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
    UUID org, property, room1, room2;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Period Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone, settings) values (?, 'Period Test', 'Asia/Kolkata', '{\"id_photo_required\":false}'::jsonb) returning id").param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room1 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '1') returning id").params(property, type).query(UUID.class).single();
            room2 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '2') returning id").params(property, type).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("expenses", "payments", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    @Test
    @SuppressWarnings("unchecked")
    void revenueOccupancyPaymentsAndExpensesAddUp() {
        var stay = desk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, new GuestService.GuestInput("Report Guest", "", "", "", "IN", null, null, null, null, null, ""),
                List.of(new BookingService.UnitRequest(room1, null, null)), 2, null, 1, 0, null, null, "", true, false, null, 50000L, "cash", null, null), null));
        desk(() -> folios.addLine(stay.folioId(), new FolioService.LineInput("extra", "Laundry", 1, 20000, today, null, "laundry"), null, null));
        desk(() -> expenses.create(new ExpenseService.ExpenseInput(today, "utilities", 30000, "", "cash", "Water"), null));

        Map<String, Object> r = desk(() -> period.report(today, today.plusDays(1)));
        var occupancy = (Map<String, Object>) r.get("occupancy");
        assertThat(occupancy.get("nightsSold")).isEqualTo(2L);                 // two nights billed
        assertThat(occupancy.get("availableNights")).isEqualTo(4L);            // two rooms × two days
        assertThat(occupancy.get("occupancyPct")).isEqualTo(50.0);
        assertThat(occupancy.get("adrPaise")).isEqualTo(100000L);
        assertThat(occupancy.get("revparPaise")).isEqualTo(50000L);

        var revenue = (Map<String, Object>) r.get("revenue");
        assertThat(revenue.get("totalPaise")).isEqualTo(220000L);
        assertThat(revenue.get("lines").toString()).contains("item=laundry");
        assertThat(((Map<String, Object>) r.get("expenses")).get("totalPaise")).isEqualTo(30000L);
        assertThat(((Map<String, Object>) r.get("net")).get("netPaise")).isEqualTo(190000L);
        assertThat(r.get("payments").toString()).contains("mode=cash").contains("received=50000");
        assertThat(((Map<String, Object>) r.get("bookings")).get("arrivals")).isEqualTo(1);
        assertThat(r.get("sources").toString()).contains("source=walk_in");
        assertThat(r.get("guests").toString()).contains("Report Guest");

        assertThatThrownBy(() -> desk(() -> period.report(today, today.minusDays(1)))).hasMessageContaining("dates");
    }
}
