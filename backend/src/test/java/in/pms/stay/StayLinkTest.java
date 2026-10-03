package in.pms.stay;

import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The guest's link to their own stay — the second endpoint in the system with no login in front of it.
 *
 * <p>The happy path is one test. The rest are the ways a stranger could try to use it: a guessed token, an
 * expired one, a revoked one, and — the one that matters most — one property's token pointed at another
 * property's booking.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StayLinkTest {

    @Autowired MockMvc mvc;
    @Autowired StayService stays;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID orgId, propertyA, propertyB, userId, bookingA, bookingB;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Stay Link Trust') returning id").query(UUID.class).single();
            propertyA = admin.sql("insert into properties(org_id, name, phone, city) values (?, 'Stay Test A', '0123456789', 'Haridwar') returning id")
                    .param(orgId).query(UUID.class).single();
            propertyB = admin.sql("insert into properties(org_id, name) values (?, 'Stay Test B') returning id").param(orgId).query(UUID.class).single();
            // Re-runnable: a run whose teardown failed leaves links pointing at this user, and they hold a
            // foreign key on it. Clear those before the user itself.
            admin.sql("delete from stay_links where created_by in (select id from users where phone = '9444444445')").update();
            admin.sql("delete from property_users where user_id in (select id from users where phone = '9444444445')").update();
            admin.sql("delete from users where phone = '9444444445'").update();
            userId = admin.sql("insert into users(name, phone) values ('Desk', '9444444445') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'manager')").params(propertyA, userId).update();
            bookingA = booking(propertyA, "Arjun Sharma", 250000L, 100000L);
            bookingB = booking(propertyB, "Someone Else", 900000L, 0L);
        });
    }

    /** A whole stay in one place: guest, room type, room, booking, the room it occupies and its folio. */
    private UUID booking(UUID property, String guestName, long totalPaise, long paidPaise) {
        // The property's own day, not the runtime's: a UTC box must not shift these across midnight.
        OffsetDateTime arrive = java.time.LocalDate.now(ZoneId.of("Asia/Kolkata")).atStartOfDay(ZoneId.of("Asia/Kolkata")).toOffsetDateTime();
        OffsetDateTime depart = arrive.plusDays(2);
        UUID guest = admin.sql("insert into guests(property_id, name) values (?, ?) returning id").params(property, guestName).query(UUID.class).single();
        UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Deluxe', 125000) returning id").param(property).query(UUID.class).single();
        UUID room = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, type).query(UUID.class).single();
        UUID id = admin.sql("insert into bookings(property_id, guest_id, state, arrive_at, depart_at, adults, children) values (?, ?, 'checked_in', ?, ?, 2, 1) returning id")
                .params(property, guest, arrive, depart).query(UUID.class).single();
        admin.sql("insert into booking_units(property_id, booking_id, room_id, rate_paise, arrive_at, depart_at) values (?, ?, ?, 125000, ?, ?)")
                .params(property, id, room, arrive, depart).update();
        admin.sql("insert into folios(property_id, booking_id, total_paise, paid_paise) values (?, ?, ?, ?)")
                .params(property, id, totalPaise, paidPaise).update();
        return id;
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            // Links first and for both properties at once: one test deliberately leaves property B's link
            // pointing at property A's booking, so a property-at-a-time sweep would trip its foreign key.
            admin.sql("delete from stay_links where property_id in (?, ?)").params(propertyA, propertyB).update();
            for (UUID p : List.of(propertyA, propertyB))
                for (String t : List.of("booking_units", "folios", "bookings", "rooms", "room_types", "guests"))
                    admin.sql("delete from " + t + " where property_id = ?").param(p).update();
            admin.sql("delete from property_users where user_id = ?").param(userId).update();
            admin.sql("delete from users where id = ?").param(userId).update();
            admin.sql("delete from properties where id in (?, ?)").params(propertyA, propertyB).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    <T> T asDesk(UUID property, java.util.function.Supplier<T> body) {
        return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    /**
     * Every public endpoint shares one rate limiter, counted per caller address, and the whole suite runs in
     * one context. These tests therefore call from their own address, so their requests are not charged to
     * the budget another test's public calls are relying on.
     */
    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder fromGuestPhone(String token) {
        return get("/api/public/stay/" + token).with(r -> { r.setRemoteAddr("198.51.100.7"); return r; });
    }

    /** The token is returned once, inside the link the desk shows; pull it back out of the URL. */
    private static String tokenOf(StayService.Link link) { return link.url().substring(link.url().lastIndexOf('/') + 1); }

    // ---------- The flow the feature exists for ----------

    @Test
    void theGuestSeesTheirOwnStayAndNothingElse() throws Exception {
        var link = asDesk(propertyA, () -> stays.create(bookingA, userId));
        assertThat(link.url()).contains("/s/");
        assertThat(link.qrDataUri()).startsWith("data:image/png;base64,");

        mvc.perform(fromGuestPhone(tokenOf(link)))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.propertyName").value("Stay Test A"))
                .andExpect(jsonPath("$.guestName").value("Arjun Sharma"))
                .andExpect(jsonPath("$.roomType").value("Deluxe"))
                .andExpect(jsonPath("$.rooms").value("101"))
                .andExpect(jsonPath("$.nights").value(2))
                .andExpect(jsonPath("$.totalPaise").value(250000))
                .andExpect(jsonPath("$.paidPaise").value(100000))
                .andExpect(jsonPath("$.duePaise").value(150000))
                .andExpect(jsonPath("$.depositPaise").value(0))
                .andExpect(jsonPath("$.reference").value(bookingA.toString().substring(0, 8).toUpperCase()));
    }

    /**
     * A deposit is money held, not a charge, so it is shown on its own line and the balance still adds up:
     * charge + deposit held - paid. Without the line the guest sees a total that contradicts the balance.
     */
    @Test
    void aDepositIsItsOwnLineAndTheBalanceStillAddsUp() throws Exception {
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update folios set deposit_held_paise = 50000 where booking_id = ?").param(bookingA).update());
        try {
            mvc.perform(fromGuestPhone(tokenOf(asDesk(propertyA, () -> stays.create(bookingA, userId)))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.depositPaise").value(50000))
                    .andExpect(jsonPath("$.duePaise").value(200000));   // 250000 + 50000 - 100000
        } finally {
            new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                    admin.sql("update folios set deposit_held_paise = 0 where booking_id = ?").param(bookingA).update());
        }
    }

    /** A guest who is owed money must be told so, not shown a tidy zero. */
    @Test
    void anOverpaidStayShowsARefundRatherThanZero() throws Exception {
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update folios set paid_paise = 300000 where booking_id = ?").param(bookingA).update());
        try {
            mvc.perform(fromGuestPhone(tokenOf(asDesk(propertyA, () -> stays.create(bookingA, userId)))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.duePaise").value(-50000))
                    .andExpect(jsonPath("$.due").value("\u20b9500"));  // the amount, without its sign
        } finally {
            new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                    admin.sql("update folios set paid_paise = 100000 where booking_id = ?").param(bookingA).update());
        }
    }

    /**
     * The disclosure rule, asserted rather than trusted: the guest's page must not hand out the tenant it
     * belongs to, any internal id, or anything about the property's staff.
     */
    @Test
    void thePageCarriesNoInternalIdentifiers() throws Exception {
        var link = asDesk(propertyA, () -> stays.create(bookingA, userId));
        String body = mvc.perform(fromGuestPhone(tokenOf(link)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(propertyA.toString()).doesNotContain(bookingA.toString()).doesNotContain(userId.toString());
        assertThat(body).doesNotContain("propertyId").doesNotContain("bookingId").doesNotContain("notes");
    }

    // ---------- What a stranger gets ----------

    @Test
    void aGuessedTokenIsIndistinguishableFromAnExpiredOne() throws Exception {
        mvc.perform(fromGuestPhone("z".repeat(43))).andExpect(status().isNotFound());
        mvc.perform(fromGuestPhone("short")).andExpect(status().isNotFound());
    }

    @Test
    void anExpiredLinkIsRefused() throws Exception {
        var link = asDesk(propertyA, () -> stays.create(bookingA, userId));
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update stay_links set expires_at = now() - interval '1 day' where id = ?").param(link.id()).update());
        mvc.perform(fromGuestPhone(tokenOf(link))).andExpect(status().isNotFound());
    }

    @Test
    void aRevokedLinkIsRefused() throws Exception {
        var link = asDesk(propertyA, () -> stays.create(bookingA, userId));
        asDesk(propertyA, () -> { stays.revoke(link.id(), userId); return null; });
        mvc.perform(fromGuestPhone(tokenOf(link))).andExpect(status().isNotFound());
    }

    /** The desk cannot mint a link for a booking that is not its own: the token would cross a tenant. */
    @Test
    void onePropertyCannotMintALinkForAnothersBooking() {
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> asDesk(propertyA, () -> stays.create(bookingB, userId))))
                .isInstanceOf(in.pms.common.NotFoundException.class);
    }

    /**
     * The isolation that matters: property B's token, resolved and read, sees only property B. Rewriting the
     * row to point at the other property's booking wins nothing, because the view is filtered by the tenant
     * the token names as well as by the booking.
     */
    @Test
    void aTokenCannotBeAimedAtAnotherPropertysBooking() throws Exception {
        var link = asDesk(propertyB, () -> stays.create(bookingB, userId));
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update stay_links set booking_id = ? where id = ?").params(bookingA, link.id()).update());
        // The token still names property B, so property A's booking is invisible to it.
        mvc.perform(fromGuestPhone(tokenOf(link))).andExpect(status().isNotFound());
    }
}
