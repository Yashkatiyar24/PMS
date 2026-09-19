package in.pms.folio;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.guests.GuestService;
import in.pms.settings.SettingDef;
import in.pms.settings.SettingsService;
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

/** Tax-inclusive rates, IGST for an inter-state company, what charges are for, and who hears about a payment. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BillingAndTaxTest {
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired ReceiptService receipts;
    @Autowired SettingsService settings;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    UUID org, property, room101, room102, room103, room104;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Money Trust') returning id").query(UUID.class).single();
            // Registered in Uttar Pradesh (state code 09).
            property = admin.sql("insert into properties(org_id, name, gstin, timezone, settings) values (?, 'Money Test', '09AAACH7409R1ZZ', 'Asia/Kolkata', '{\"id_photo_required\":false,\"whatsapp_guest_updates\":true}'::jsonb) returning id")
                    .param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 105000) returning id").param(property).query(UUID.class).single();
            room101 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, type).query(UUID.class).single();
            room102 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '102') returning id").params(property, type).query(UUID.class).single();
            room103 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '103') returning id").params(property, type).query(UUID.class).single();
            room104 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '104') returning id").params(property, type).query(UUID.class).single();
            admin.sql("insert into tax_rules(property_id, effective_from, rules) values (?, '2020-01-01', '{\"slabs\":[{\"uptoPaise\":750000,\"bp\":500},{\"bp\":1800}]}'::jsonb)").param(property).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("receipts", "receipt_counters", "payments", "folio_lines", "folios", "booking_members", "booking_units", "bookings", "guests", "rooms", "room_types", "tax_rules", "outbox"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    Booking stay(UUID room, int nights, BookingService.Details details) {
        return desk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, new GuestService.GuestInput("Payer", "9812300001", "", "", "IN", null, null, null, null, null, ""),
                List.of(new BookingService.UnitRequest(room, null, null)), nights, null, 1, 0, null, null, "", true, true, null, null, null, null, null, details), null));
    }

    @Test
    void aTaxInclusiveRateBillsExactlyWhatWasQuoted() {
        desk(() -> settings.update(Map.of("rates_include_tax", true), SettingDef.Role.OWNER, null));
        try {
            Booking b = stay(room101, 2, null);
            Folio f = desk(() -> folios.get(b.folioId()));
            assertThat(f.totalPaise()).as("2 nights at ₹1,050 including GST").isEqualTo(210000);
            assertThat(f.taxPaise()).isEqualTo(10000);
            assertThat(f.lines()).filteredOn(l -> l.kind().equals("room_charge")).allSatisfy(l -> {
                assertThat(l.unitPaise()).isEqualTo(100000);
                assertThat(l.category()).isEqualTo("room");
            });
            // An inclusive extra of ₹210 is ₹200 + ₹10 GST.
            Folio withTea = desk(() -> folios.addLine(b.folioId(), new FolioService.LineInput("extra", "Tea", 1, 21000, LocalDate.now(ZONE), null, "food"), null, null));
            assertThat(withTea.totalPaise()).isEqualTo(231000);
        } finally {
            desk(() -> settings.update(Map.of("rates_include_tax", false), SettingDef.Role.OWNER, null));
        }
    }

    @Test
    void anInterStateCompanyIsBilledIgstOnlyWhenThePropertyAsksForIt() {
        var maharashtra = new BookingService.Details(null, null, "Acme Pvt Ltd", "27AAACH7409R1ZZ");
        Booking plain = stay(room102, 1, maharashtra);
        assertThat(desk(() -> folios.get(plain.folioId())).lines()).allSatisfy(l -> assertThat(l.igstPaise()).isZero());

        desk(() -> settings.update(Map.of("igst_for_interstate_b2b", true), SettingDef.Role.OWNER, null));
        try {
            Booking b = stay(room103, 1, maharashtra);
            Folio f = desk(() -> folios.get(b.folioId()));
            Folio.Line night = f.lines().stream().filter(l -> l.kind().equals("room_charge")).findFirst().orElseThrow();
            assertThat(night.igstPaise()).isEqualTo(5250);   // 5% of ₹1,050
            assertThat(night.cgstPaise() + night.sgstPaise()).isZero();
            assertThat(f.totalPaise()).isEqualTo(110250);

            desk(() -> folios.recordPayment(b.folioId(), new FolioService.PaymentInput("upi", f.balanceDuePaise(), "UPI/1", null, null, null), null));
            desk(() -> bookings.checkOut(b.id(), b.departAt(), null, null, null));
            var invoice = desk(() -> receipts.issueInvoice(b.folioId(), null));
            @SuppressWarnings("unchecked") Map<String, Object> guest = (Map<String, Object>) invoice.snapshot().get("guest");
            assertThat(guest).containsEntry("organization", "Acme Pvt Ltd").containsEntry("billing_gstin", "27AAACH7409R1ZZ");
            assertThat(invoice.snapshot().get("taxBreakup").toString()).contains("igstPaise=5250");
        } finally {
            desk(() -> settings.update(Map.of("igst_for_interstate_b2b", false), SettingDef.Role.OWNER, null));
        }
    }

    @Test
    void anExtraSaysWhatItIsForAndAPaymentIsAnnounced() {
        Booking b = stay(room104, 1, null);
        assertThatThrownBy(() -> desk(() -> folios.addLine(b.folioId(), new FolioService.LineInput("extra", "Spa", 1, 10000, null, null, "spa"), null, null)))
                .hasMessageContaining("Category");
        Folio f = desk(() -> folios.addLine(b.folioId(), new FolioService.LineInput("extra", "Laundry", 2, 5000, null, null, "laundry"), null, null));
        assertThat(f.lines()).anySatisfy(l -> assertThat(l.category()).isEqualTo("laundry"));
        desk(() -> folios.recordPayment(b.folioId(), new FolioService.PaymentInput("cash", 5000, "", null, null, null), null));
        assertThat(admin.sql("select count(*) from notifications where property_id = ? and kind = 'payment_received'").param(property).query(Integer.class).single()).isPositive();
        // The guest opted in, so a WhatsApp acknowledgement is queued.
        assertThat(admin.sql("select count(*) from outbox where property_id = ? and payload->>'template' = 'payment_received'").param(property).query(Integer.class).single()).isPositive();
    }
}
