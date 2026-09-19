package in.pms.reports;

import in.pms.booking.BookingService;
import in.pms.folio.FolioService;
import in.pms.folio.ReceiptService;
import in.pms.guests.GuestService;
import in.pms.jobs.DailyReportService;
import in.pms.jobs.JobRunner;
import in.pms.messaging.OutboxSender;
import in.pms.print.ReceiptRenderer;
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
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Reports read what the desk actually did; the outbox carries messages without blocking anything. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ReportsAndJobsTest {

    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired ReceiptService receipts;
    @Autowired ReceiptRenderer renderer;
    @Autowired ReportService reports;
    @Autowired DailyReportService dailyReports;
    @Autowired OutboxSender outboxSender;
    @Autowired SettingsService settings;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID orgId, property, owner, roomType, room1, room2;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from property_users where user_id in (select id from users where phone = '9444444444')").update();
            admin.sql("delete from users where phone = '9444444444'").update();
            orgId = admin.sql("insert into organisations(name) values ('Report Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, gstin, phone) values (?, 'Report Test', '09AAACH7409R1ZZ', '01334-111111') returning id").param(orgId).query(UUID.class).single();
            owner = admin.sql("insert into users(name, phone, email) values ('Owner', '9444444444', 'reportowner@test.local') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'owner')").params(property, owner).update();
            roomType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room1 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '201') returning id").params(property, roomType).query(UUID.class).single();
            room2 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '202') returning id").params(property, roomType).query(UUID.class).single();
            admin.sql("insert into tax_rules(property_id, effective_from, rules) values (?, '2020-01-01', '{\"slabs\":[{\"uptoPaise\":750000,\"bp\":500},{\"bp\":1800}]}'::jsonb)").param(property).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from outbox where property_id = ?").param(property).update();
            admin.sql("delete from job_runs where key like ?").param(property + "%").update();
            for (String t : List.of("daily_reports", "receipts", "receipt_counters", "payments", "folio_lines", "folios",
                    "booking_units", "booking_members", "bookings", "guests", "cash_handovers", "rooms", "room_types", "tax_rules"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from property_users where property_id = ?").param(property).update();
            admin.sql("delete from users where id = ?").param(owner).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    <T> T asDesk(java.util.function.Supplier<T> body) {
        return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    static GuestService.GuestInput guest(String name, String phone) {
        return new GuestService.GuestInput(name, phone, "Haridwar", "Main road", "IN", "voter", "1234", null, null, null, "");
    }

    UUID stayWithPayment(UUID room, String name, String phone, long payPaise, boolean optIn) {
        var b = asDesk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, guest(name, phone),
                List.of(new BookingService.UnitRequest(room, null, null)), 1, null, 2, 0, null, null, "", true, optIn,
                "skipped for test", payPaise, "cash", null, null), owner));
        return b.id();
    }

    @Test @Order(1)
    void dailyReportCountsCollectionsArrivalsAndOccupancy() {
        stayWithPayment(room1, "Report Guest", "9812340001", 60000, false);
        var daily = asDesk(() -> reports.daily(null));
        assertThat((Number) daily.get("collectedPaise")).returns(60000L, Number::longValue);
        assertThat(daily.get("arrivals")).isEqualTo(1);
        assertThat((Number) daily.get("occupiedUnits")).returns(1L, Number::longValue);
        assertThat((Number) daily.get("sellableUnits")).returns(2L, Number::longValue);
        assertThat(daily.get("occupancyPct")).isEqualTo(50L);
        // The same stay must be counted whatever time of day the report is asked for.
        // ₹1000 + 5% GST = ₹1050, of which ₹600 paid
        assertThat((Number) daily.get("outstandingPaise")).returns(45000L, Number::longValue);
    }

    @Test @Order(2)
    void businessDayFollowsTheConfiguredHour() {
        ZoneId zone = ZoneId.of("Asia/Kolkata");
        var before = asDesk(() -> reports.businessDay(LocalDate.of(2026, 10, 5), zone));
        assertThat(before.from().atZoneSameInstant(zone).toLocalTime().toString()).isEqualTo("21:00");
        assertThat(before.to().atZoneSameInstant(zone).toLocalDate()).isEqualTo(LocalDate.of(2026, 10, 6));

        asDesk(() -> settings.update(Map.of("business_day_start", "06:00"), SettingDef.Role.OWNER, owner));
        var after = asDesk(() -> reports.businessDay(LocalDate.of(2026, 10, 5), zone));
        assertThat(after.from().atZoneSameInstant(zone).toLocalTime().toString()).isEqualTo("06:00");
        asDesk(() -> settings.update(Map.of("business_day_start", "21:00"), SettingDef.Role.OWNER, owner));
    }

    @Test @Order(3)
    void monthSummaryBreaksTaxDownByRateForTheAccountant() {
        var month = asDesk(() -> reports.month(YearMonth.now()));
        var byRate = (List<Map<String, Object>>) month.get("taxableByRate");
        assertThat(byRate).isNotEmpty();
        assertThat((Number) month.get("taxPaise")).returns(5000L, Number::longValue);
        assertThat((Number) month.get("revenuePaise")).returns(100000L, Number::longValue);
    }

    @Test @Order(4)
    void outstandingAndCashInHandListWhatIsOwedAndWhoHoldsIt() {
        assertThat(asDesk(() -> reports.outstanding())).hasSize(1);
        var cash = asDesk(() -> reports.cashInHand());
        assertThat(cash).anySatisfy(r -> assertThat(((Number) r.get("cash_paise")).longValue()).isEqualTo(60000L));

        var handover = asDesk(() -> reports.handOverCash(owner, owner, "evening"));
        assertThat(((Number) handover.get("amountPaise")).longValue()).isEqualTo(60000L);
        // After handing over, the counter starts again from zero.
        assertThat(asDesk(() -> reports.cashInHand())).allSatisfy(r -> assertThat(((Number) r.get("cash_paise")).longValue()).isZero());
    }

    @Test @Order(5)
    void policeRegisterUsesTheConfiguredColumns() {
        // The property's date, not the server's: just after midnight in India it is still yesterday in UTC.
        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));
        var register = asDesk(() -> reports.policeRegister(today.minusDays(1), today));
        assertThat((List<String>) register.get("columns")).contains("serial", "name", "arrival");
        assertThat((List<?>) register.get("rows")).isNotEmpty();

        asDesk(() -> settings.update(Map.of("register_template", List.of("serial", "name", "phone")), SettingDef.Role.MANAGER, owner));
        var narrower = asDesk(() -> reports.policeRegister(today.minusDays(1), today));
        assertThat((List<String>) narrower.get("columns")).containsExactly("serial", "name", "phone");
    }

    @Test @Order(6)
    void receiptsRenderForEveryPrinterProfile() {
        UUID bookingId = stayWithPayment(room2, "Print Guest", "9812340002", 105000, false);
        var folio = asDesk(() -> folios.forBooking(bookingId));
        var invoice = asDesk(() -> receipts.issueInvoice(folio.id(), owner));

        for (String profile : List.of("thermal_58", "thermal_80", "a4")) {
            String html = asDesk(() -> renderer.html(invoice.id(), profile));
            assertThat(html).contains(invoice.number()).contains("Print Guest").contains("कुल");
        }
        byte[] pdf = asDesk(() -> renderer.pdf(invoice.id(), "a4", owner));
        assertThat(pdf).hasSizeGreaterThan(1000);
        assertThat(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
        assertThat(asDesk(() -> receipts.get(invoice.id())).pdfKey()).isNotNull();
    }

    @Test @Order(7)
    void theEveningReportIsQueuedOnceAndTheOutboxDeliversIt() {
        var ref = new JobRunner.PropertyRef(property, "Report Test", ZoneId.of("Asia/Kolkata"));
        LocalDate businessDate = asDesk(() -> reports.businessDay(null, ref.zone())).businessDate();

        asDesk(() -> dailyReports.send(ref, businessDate, settings.current()));
        asDesk(() -> dailyReports.send(ref, businessDate, settings.current())); // a second send must not duplicate

        Integer queued = admin.sql("select count(*) from outbox where property_id = ? and status = 'pending'").param(property).query(Integer.class).single();
        assertThat(queued).isEqualTo(2); // one WhatsApp, one email, both idempotent

        int sent = outboxSender.drain(10);
        assertThat(sent).isEqualTo(2);
        Integer pending = admin.sql("select count(*) from outbox where property_id = ? and status <> 'sent'").param(property).query(Integer.class).single();
        assertThat(pending).isZero();

        var stored = admin.sql("select payload::text from daily_reports where property_id = ? and business_date = ?").params(property, businessDate).query(String.class).single();
        assertThat(stored).contains("collectedPaise");
    }
}
