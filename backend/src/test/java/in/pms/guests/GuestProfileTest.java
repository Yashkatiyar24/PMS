package in.pms.guests;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.folio.FolioService;
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

import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** One guest's page: the stay they are in, the ones before, what they paid and what they owe. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GuestProfileTest {
    @Autowired GuestService guests;
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID org, property, room;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Guest Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone, settings) values (?, 'Guest Test', 'Asia/Kolkata', '{\"id_photo_required\":false}'::jsonb) returning id").param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, type).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("payments", "folio_lines", "folios", "booking_members", "booking_units", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    @Test
    void theProfileShowsTheCurrentStayWhatWasPaidAndWhatIsOwed() {
        Guest g = desk(() -> guests.create(new GuestService.GuestInput("Kamla Devi", "9811100001", "Indore", "", "IN", null, null, null, null, null, "",
                "kamla@example.in", "Madhya Pradesh", "India"), null));
        assertThat(g.email()).isEqualTo("kamla@example.in");
        assertThat(g.state()).isEqualTo("Madhya Pradesh");

        Booking stay = desk(() -> bookings.checkIn(new BookingService.CheckInRequest(g.id(), null, List.of(new BookingService.UnitRequest(room, null, null)), 2, null,
                1, 0, null, null, "", true, false, null, 50000L, "cash", null, null), null));

        GuestService.Profile p = desk(() -> guests.profile(g.id()));
        assertThat(p.current()).isNotNull();
        assertThat(p.current().bookingId()).isEqualTo(stay.id());
        assertThat(p.stays()).hasSize(1);
        assertThat(p.payments()).singleElement().satisfies(pay -> assertThat(pay.amountPaise()).isEqualTo(50000));
        assertThat(p.spentPaise()).isEqualTo(50000);
        assertThat(p.outstandingPaise()).isEqualTo(200000 - 50000);

        // Searching finds them by city or email as well as name and phone.
        assertThat(desk(() -> guests.search("indore"))).extracting(Guest::id).contains(g.id());
        assertThat(desk(() -> guests.search("kamla@"))).extracting(Guest::id).contains(g.id());

        // An update that does not mention the new fields leaves them alone.
        Guest updated = desk(() -> guests.update(g.id(), new GuestService.GuestInput("Kamla Devi", "9811100001", "Ujjain", "", "IN", null, null, null, null, null, ""), null));
        assertThat(updated.city()).isEqualTo("Ujjain");
        assertThat(updated.email()).isEqualTo("kamla@example.in");
    }

    @Test
    void aBadEmailIsRefused() {
        assertThatThrownBy(() -> desk(() -> guests.create(new GuestService.GuestInput("X", "", "", "", "IN", null, null, null, null, null, "", "not an email", null, null), null)))
                .hasMessageContaining("email");
    }
}
