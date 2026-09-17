package in.pms.print;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.folio.ReceiptService;
import in.pms.guests.GuestService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A receipt for a property that has filled in almost nothing.
 *
 * <p>Most dharamshalas are not GST-registered and many have no 80G number, no email and no printed address,
 * so the sparsest possible property is the ordinary case rather than an edge one. Everything optional is
 * left empty here on purpose: the document must still print.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReceiptRenderingTest {

    @Autowired BookingService bookings;
    @Autowired ReceiptService receipts;
    @Autowired ReceiptRenderer renderer;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID orgId, property, userId, roomType, room, room2;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Bare Trust') returning id").query(UUID.class).single();
            // No gstin, no email, no trust_reg_no, no reg_80g: a small trust that registered for none of it.
            property = admin.sql("insert into properties(org_id, name, timezone) values (?, 'Bare Dharamshala', 'Asia/Kolkata') returning id")
                    .param(orgId).query(UUID.class).single();
            admin.sql("delete from property_users where user_id in (select id from users where phone = '9555555555')").update();
            admin.sql("delete from users where phone = '9555555555'").update();
            userId = admin.sql("insert into users(name, phone) values ('Desk', '9555555555') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'manager')").params(property, userId).update();
            roomType = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Std', 50000, 3) returning id")
                    .param(property).query(UUID.class).single();
            room = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '1') returning id")
                    .params(property, roomType).query(UUID.class).single();
            room2 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '2') returning id")
                    .params(property, roomType).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("receipts", "receipt_counters", "payments", "folio_lines", "folios",
                                    "booking_units", "booking_members", "bookings", "guests", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from property_users where user_id = ?").param(userId).update();
            admin.sql("delete from users where id = ?").param(userId).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    <T> T asDesk(java.util.function.Supplier<T> body) {
        return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    @Test
    void aReceiptPrintsForAPropertyWithNoGstinAndNoEightyG() {
        Booking stay = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(
                null, new GuestService.GuestInput("Bare Guest", "9876500000", "Haridwar", "", "IN", "voter", "1111", null, null, null, ""),
                List.of(new BookingService.UnitRequest(room, null, null)), 1, null,
                1, 0, List.of(), "pilgrimage", "", true, false, "Camera not working",
                0L, "cash", 0L, UUID.randomUUID()), userId));

        var invoice = asDesk(() -> receipts.issueInvoice(stay.folioId(), userId));

        // The snapshot keeps the empty fields rather than dropping the keys, so its shape does not depend on
        // how much of the property was filled in.
        assertThat(invoice.snapshot()).extracting("property", org.assertj.core.api.InstanceOfAssertFactories.MAP)
                .containsKeys("gstin", "reg_80g", "email", "trust_reg_no");

        String html = asDesk(() -> renderer.html(invoice.id(), null));
        assertThat(html).contains("Bare Dharamshala").contains("Bare Guest");
        // Nothing invents a GSTIN line for a property that has none.
        assertThat(html).doesNotContain("GSTIN").doesNotContain("null");

        byte[] pdf = asDesk(() -> renderer.pdf(invoice.id(), null, userId));
        assertThat(pdf).startsWith("%PDF-".getBytes());
    }

    /**
     * Receipts issued before the snapshot kept its nulls have holes in them, and a receipt is immutable, so
     * those holes are permanent. The template has to render them anyway — this reproduces such a row
     * directly rather than pretending the old ones do not exist.
     */
    @Test
    void anOlderReceiptWhoseSnapshotIsMissingKeysStillPrints() {
        Booking stay = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(
                null, new GuestService.GuestInput("Legacy Guest", "9876500001", "Haridwar", "", "IN", "voter", "2222", null, null, null, ""),
                List.of(new BookingService.UnitRequest(room2, null, null)), 1, null,
                1, 0, List.of(), "pilgrimage", "", true, false, "Camera not working",
                0L, "cash", 0L, UUID.randomUUID()), userId));
        var invoice = asDesk(() -> receipts.issueInvoice(stay.folioId(), userId));

        // Strip the optional keys from the stored snapshot, exactly as the old serialisation did.
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> admin.sql(
                "update receipts set snapshot = jsonb_set(snapshot, '{property}', "
                + "(snapshot->'property') - 'gstin' - 'reg_80g' - 'email' - 'trust_reg_no' - 'phone') "
                + "where id = ?").param(invoice.id()).update());

        String html = asDesk(() -> renderer.html(invoice.id(), null));
        assertThat(html).contains("Bare Dharamshala").contains("Legacy Guest").doesNotContain("GSTIN");
    }
}
