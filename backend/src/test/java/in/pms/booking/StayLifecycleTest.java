package in.pms.booking;

import in.pms.folio.FolioService;
import in.pms.folio.ReceiptService;
import in.pms.guests.GuestService;
import in.pms.inventory.InventoryService;
import in.pms.settings.SettingDef;
import in.pms.settings.SettingsService;
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
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.assertj.core.api.InstanceOfAssertFactories.LIST;

/** The desk's day, end to end: check in, add extras, take money, check out, invoice, correct with a credit note. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class StayLifecycleTest {

    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired ReceiptService receipts;
    @Autowired InventoryService inventory;
    @Autowired SettingsService settings;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID orgId, property, user, roomType, dormType, room101, room102, room103, room104, dormRoom;
    List<UUID> dormBeds = new ArrayList<>();
    Booking stay;   // carried between the ordered steps of the desk's day

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Stay Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, gstin, timezone) values (?, 'Stay Test', '09AAACH7409R1ZZ', 'Asia/Kolkata') returning id").param(orgId).query(UUID.class).single();
            // Re-runnable: a leftover user from a failed run must not break setup.
            admin.sql("delete from property_users where user_id in (select id from users where phone = '9333333333')").update();
            admin.sql("delete from users where phone = '9333333333'").update();
            user = admin.sql("insert into users(name, phone) values ('Desk', '9333333333') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'manager')").params(property, user).update();
            roomType = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Std', 100000, 3) returning id").param(property).query(UUID.class).single();
            dormType = admin.sql("insert into room_types(property_id, name, base_rate_paise, is_dormitory, bed_count) values (?, 'Dorm', 20000, true, 2) returning id").param(property).query(UUID.class).single();
            room101 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, roomType).query(UUID.class).single();
            room102 = room(roomType, "102");
            room103 = room(roomType, "103");
            room104 = room(roomType, "104");
            dormRoom = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, 'D1') returning id").params(property, dormType).query(UUID.class).single();
            for (String label : List.of("D1-1", "D1-2"))
                dormBeds.add(admin.sql("insert into beds(property_id, room_id, label) values (?, ?, ?) returning id").params(property, dormRoom, label).query(UUID.class).single());
            admin.sql("insert into tax_rules(property_id, effective_from, rules) values (?, '2020-01-01', '{\"slabs\":[{\"uptoPaise\":750000,\"bp\":500},{\"bp\":1800}]}'::jsonb)").param(property).update();
        });
    }

    UUID room(UUID type, String number) {
        return admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, ?) returning id").params(property, type, number).query(UUID.class).single();
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("receipts", "receipt_counters", "payments", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "beds", "rooms", "room_types", "tax_rules"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from property_users where property_id = ?").param(property).update();
            admin.sql("delete from users where id = ?").param(user).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    /** Everything a request would do: tenant in context, one transaction. */
    <T> T asDesk(java.util.function.Supplier<T> body) {
        return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    static GuestService.GuestInput guest(String name, String phone) {
        return new GuestService.GuestInput(name, phone, "Haridwar", "Main road", "IN", "voter", "4821", null, null, null, "");
    }

    @Test @Order(1)
    void walkInCheckInChargesTaxAndTakesAnAdvance() {
        var booking = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(
                null, guest("Arjun Sharma", "9812345678"),
                List.of(new BookingService.UnitRequest(room101, null, null)), 2, null,
                2, 1, null, "pilgrimage", "", true, true, "photo taken on paper register",
                50000L, "cash", 20000L, null), user));

        stay = booking;
        assertThat(booking.state()).isEqualTo("checked_in");
        assertThat(booking.units()).singleElement().extracting(Booking.Unit::roomNumber).isEqualTo("101");

        var folio = asDesk(() -> folios.get(booking.folioId()));
        // 2 nights x ₹1000 = ₹2000, GST 5% = ₹100
        assertThat(folio.lines()).filteredOn(l -> l.kind().equals("room_charge")).hasSize(2);
        assertThat(folio.totalPaise()).isEqualTo(210000);
        assertThat(folio.taxPaise()).isEqualTo(10000);
        assertThat(folio.depositHeldPaise()).isEqualTo(20000);
        assertThat(folio.paidPaise()).isEqualTo(50000);
        assertThat(folio.balanceDuePaise()).isEqualTo(210000 + 20000 - 50000);
    }

    @Test @Order(2)
    void extrasAreTaxedAndCheckoutRefusesAnUnpaidBalance() {
        var booking = stay;
        assertThat(asDesk(() -> bookings.today()).get("inHouse")).asInstanceOf(LIST).isNotEmpty();

        asDesk(() -> folios.addLine(booking.folioId(), new FolioService.LineInput("extra", "Thali x2", 2, 15000, LocalDate.now(), null), user, null));
        var afterExtra = asDesk(() -> folios.get(booking.folioId()));
        assertThat(afterExtra.lines()).anyMatch(l -> l.kind().equals("extra") && l.cgstPaise() + l.sgstPaise() == 1500);

        // Leaving now would shorten the stay, which is a reduction and needs approval:
        assertThatThrownBy(() -> asDesk(() -> bookings.checkOut(booking.id(), null, null, user, null)))
                .hasMessageContaining("manager approval");
        // Leaving as booked, with money still owed, is refused for the other reason:
        assertThatThrownBy(() -> asDesk(() -> bookings.checkOut(booking.id(), booking.departAt(), null, user, null)))
                .hasMessageContaining("unpaid");
    }

    @Test @Order(3)
    void settleCheckOutAndIssueAnInvoiceThenCorrectItWithACreditNote() {
        var booking = stay;

        // Refund the deposit, then pay the rest
        asDesk(() -> folios.addLine(booking.folioId(), new FolioService.LineInput("deposit_refund", "Deposit returned", 1, -20000, LocalDate.now(), null), user, null));
        var due = asDesk(() -> folios.get(booking.folioId())).balanceDuePaise();
        asDesk(() -> folios.recordPayment(booking.folioId(), new FolioService.PaymentInput("upi", due, "UPI/12345", null, null, null), user));

        var out = asDesk(() -> bookings.checkOut(booking.id(), booking.departAt(), null, user, null));
        assertThat(out.state()).isEqualTo("checked_out");
        assertThat(asDesk(() -> folios.get(booking.folioId())).status()).isEqualTo("settled");
        assertThat(asDesk(() -> inventory.room(room101)).status()).isEqualTo("dirty");

        var invoice = asDesk(() -> receipts.issueInvoice(booking.folioId(), user));
        assertThat(invoice.number()).matches("/?26-27/\\d{4}|.*\\d{4}");
        assertThat(invoice.kind()).isEqualTo("invoice");
        assertThat(invoice.snapshot()).containsKeys("property", "guest", "lines", "totals", "taxBreakup");

        var note = asDesk(() -> receipts.creditNote(invoice.id(), 10000, "Overcharged one thali", user, user));
        assertThat(note.kind()).isEqualTo("credit_note");
        assertThat(note.snapshot()).containsEntry("againstNumber", invoice.number());

        assertThatThrownBy(() -> asDesk(() -> receipts.creditNote(invoice.id(), invoice.amountPaise(), "too much", user, user)))
                .hasMessageContaining("exceeds");
    }

    @Test @Order(4)
    void receiptNumbersAreGapFreeAndUniqueUnderConcurrency() throws Exception {
        var b = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(
                null, guest("Priya Patel", "9812345679"), List.of(new BookingService.UnitRequest(room102, null, null)), 1, null,
                1, 0, null, null, "", true, false, "skipped for test", null, null, null, null), user));

        int n = 12;
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < n; i++) futures.add(pool.submit(() -> asDesk(() -> receipts.issueProvisional(b.folioId(), 1000, user)).number()));
            Set<String> numbers = new HashSet<>();
            for (var f : futures) numbers.add(f.get(30, TimeUnit.SECONDS));
            assertThat(numbers).hasSize(n);
            List<Integer> seqs = numbers.stream().map(s -> Integer.parseInt(s.substring(s.lastIndexOf('/') + 1))).sorted().toList();
            assertThat(seqs.get(seqs.size() - 1) - seqs.get(0)).isEqualTo(n - 1); // no gaps
        }
    }

    @Test @Order(5)
    void twoDesksRacingForTheLastBedProduceExactlyOneStay() throws Exception {
        // Fill the first bed so only one is left
        asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, guest("Bed One", "9812345680"),
                List.of(new BookingService.UnitRequest(dormRoom, dormBeds.get(0), null)), 1, null, 1, 0, null, null, "", true, false, "skipped for test", null, null, null, null), user));

        var start = new CountDownLatch(1);
        Callable<Object> claim = () -> {
            start.await();
            try {
                return asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, guest("Racer", "9812345681"),
                        List.of(new BookingService.UnitRequest(dormRoom, dormBeds.get(1), null)), 1, null, 1, 0, null, null, "", true, false, "skipped for test", null, null, null, null), user));
            } catch (Exception e) { return e; }
        };
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = pool.submit(claim);
            var b = pool.submit(claim);
            start.countDown();
            List<Object> results = List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
            assertThat(results).filteredOn(r -> r instanceof Booking).hasSize(1);
            assertThat(results).filteredOn(r -> r instanceof Exception).singleElement()
                    .satisfies(e -> assertThat(((Exception) e).getMessage()).contains("already taken"));
        }
    }

    @Test @Order(6)
    void settingsChangeBehaviourWithoutCodeChanges() {
        // Turn on donation mode (with CA confirmation) and the next invoice is a donation receipt with no tax.
        asDesk(() -> settings.update(Map.of("donation_mode", true, "donation_mode_ca_confirmed", true), SettingDef.Role.OWNER, user));
        var b = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, guest("Donor", "9812345682"),
                List.of(new BookingService.UnitRequest(room103, null, null)), 1, null, 1, 0, null, null, "", true, false, "skipped for test", null, null, null, null), user));
        var folio = asDesk(() -> folios.get(b.folioId()));
        assertThat(folio.taxPaise()).isZero();
        var receipt = asDesk(() -> receipts.issueInvoice(b.folioId(), user));
        assertThat(receipt.kind()).isEqualTo("donation");
        asDesk(() -> settings.update(Map.of("donation_mode", false, "donation_mode_ca_confirmed", false), SettingDef.Role.OWNER, user));
    }

    @Test @Order(7)
    void aadhaarNumbersAreRefused() {
        assertThatThrownBy(() -> asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(null,
                new GuestService.GuestInput("Test", "9812345683", "X", "Aadhaar 1234 5678 9012", "IN", "aadhaar", "9012", null, null, null, ""),
                List.of(new BookingService.UnitRequest(room104, null, null)), 1, null, 1, 0, null, null, "", true, false, "skipped for test", null, null, null, null), user)))
                .hasMessageContaining("Aadhaar");
    }
}
