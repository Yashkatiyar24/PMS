package in.pms.channels;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Selling online, from the outside in: a stranger booking on the property's page, an OTA reading our
 * calendar, and an OTA's calendar being reconciled into ours.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OnlineSellingTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ChannelService channels;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    UUID orgId, property, roomType, room101, room102;
    String slug = "online-test-" + UUID.randomUUID().toString().substring(0, 6);
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Online Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, phone, booking_slug, settings) values (?, 'Online Test', '9000000000', ?, '{\"online_booking_enabled\": true}'::jsonb) returning id")
                    .params(orgId, slug).query(UUID.class).single();
            roomType = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Std', 100000, 3) returning id").param(property).query(UUID.class).single();
            room101 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, roomType).query(UUID.class).single();
            room102 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '102') returning id").params(property, roomType).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            // audit_log is left alone: no role may delete from it.
            for (String t : List.of("channel_stays", "channel_links", "outbox", "receipts", "receipt_counters", "payments", "folio_lines", "folios",
                    "booking_units", "booking_members", "bookings", "guests", "beds", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(orgId).update();
        });
    }

    // ---------- The booking page ----------

    @Test @Order(1)
    void aGuestBooksOnThePropertysOwnPage() throws Exception {
        mvc.perform(get("/api/public/book/" + slug)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Online Test"));
        String arrive = today.plusDays(10).toString(), depart = today.plusDays(12).toString();
        mvc.perform(get("/api/public/book/" + slug + "/availability").param("arrive", arrive).param("depart", depart))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].free").value(2)).andExpect(jsonPath("$[0].totalPaise").value(200000));

        mvc.perform(post("/api/public/book/" + slug).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                        "roomTypeId", roomType, "arrive", arrive, "depart", depart, "adults", 2, "children", 0,
                        "name", "Sita Devi", "phone", "+91 98765 43210", "city", "Varanasi", "consent", true, "whatsappOptIn", false))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference").isString()).andExpect(jsonPath("$.nights").value(2));

        mvc.perform(get("/api/public/book/" + slug + "/availability").param("arrive", arrive).param("depart", depart))
                .andExpect(jsonPath("$[0].free").value(1));
        assertThat(admin.sql("select source::text from bookings where property_id = ?").param(property).query(String.class).list()).containsExactly("website");
    }

    @Test @Order(2)
    void strangersCannotBookNonsense() throws Exception {
        var base = new java.util.HashMap<String, Object>(Map.of("roomTypeId", roomType, "adults", 1, "children", 0, "name", "X", "consent", true, "whatsappOptIn", false));
        base.put("arrive", today.minusDays(1).toString()); base.put("depart", today.plusDays(1).toString()); base.put("phone", "9876543210");
        mvc.perform(post("/api/public/book/" + slug).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(base))).andExpect(status().isBadRequest());
        base.put("arrive", today.plusDays(3).toString()); base.put("depart", today.plusDays(4).toString()); base.put("phone", "12345");
        mvc.perform(post("/api/public/book/" + slug).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(base))).andExpect(status().isBadRequest());
        base.put("phone", "9876543210"); base.put("adults", 9);
        mvc.perform(post("/api/public/book/" + slug).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(base))).andExpect(status().isBadRequest());
    }

    @Test @Order(3)
    void aSwitchedOffPageLooksLikeNoPageAtAll() throws Exception {
        // The pools run with autocommit off, so a write outside a transaction would never be seen.
        var tx = new TransactionTemplate(adminTx);
        tx.executeWithoutResult(s -> admin.sql("update properties set settings = '{}'::jsonb where id = ?").param(property).update());
        try {
            mvc.perform(get("/api/public/book/" + slug)).andExpect(status().isNotFound());
            mvc.perform(get("/api/public/book/no-such-page")).andExpect(status().isNotFound());
        } finally {
            tx.executeWithoutResult(s -> admin.sql("update properties set settings = '{\"online_booking_enabled\": true}'::jsonb where id = ?").param(property).update());
        }
    }

    // ---------- Calendars ----------

    @Test @Order(4)
    void theExportCarriesDatesAndNothingElse() throws Exception {
        var link = asDesk(() -> channels.create(room101, "airbnb", null, null));
        String body = mvc.perform(get("/api/public/calendar/" + link.exportToken() + ".ics"))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/calendar"))
                .andReturn().getResponse().getContentAsString();
        // The online booking above was auto-assigned to 101, the first free room.
        assertThat(body).contains("DTSTART;VALUE=DATE:" + today.plusDays(10).toString().replace("-", ""), "SUMMARY:Not available");
        assertThat(body).doesNotContain("Sita", "98765", "100000");
        mvc.perform(get("/api/public/calendar/not-a-real-token-at-all-000000.ics")).andExpect(status().isNotFound());
    }

    @Test @Order(5)
    void anOtaCalendarIsReconciledIntoOurs() {
        UUID link = asDesk(() -> channels.create(room102, "booking_com", null, null)).id();
        var stay = new ICal.Event("bk-1", today.plusDays(20), today.plusDays(23), "CLOSED - Not available", false);

        var first = asDesk(() -> channels.apply(link, List.of(stay)));
        assertThat(first.added()).isEqualTo(1);
        assertThat(asDesk(() -> channels.apply(link, List.of(stay))).added()).as("a re-sync changes nothing").isZero();
        assertThat(otaBookings("reserved")).isEqualTo(1);

        var moved = new ICal.Event("bk-1", today.plusDays(21), today.plusDays(24), "CLOSED - Not available", false);
        assertThat(asDesk(() -> channels.apply(link, List.of(moved))).moved()).isEqualTo(1);

        assertThat(asDesk(() -> channels.apply(link, List.of())).cancelled()).as("gone from the OTA before arrival").isEqualTo(1);
        assertThat(otaBookings("cancelled")).isEqualTo(1);
    }

    @Test @Order(6)
    void aDoubleBookingIsFlaggedNotForced() {
        UUID link = asDesk(() -> channels.create(room101, "makemytrip", null, null)).id();
        // Room 101 holds the online booking for nights +10..+12.
        var clash = new ICal.Event("mmt-1", today.plusDays(11), today.plusDays(13), "Reserved", false);
        var reflection = new ICal.Event("mmt-2", today.plusDays(10), today.plusDays(12), "Not available", false);

        var result = asDesk(() -> channels.apply(link, List.of(clash, reflection)));
        assertThat(result.clashes()).isEqualTo(1);
        assertThat(result.added()).isZero();
        assertThat(asDesk(() -> channels.overview()).conflicts()).singleElement()
                .satisfies(c -> assertThat(c.conflict()).contains("already booked"));
        assertThat(admin.sql("select count(*) from booking_units where room_id = ? and cancelled_at is null").param(room101).query(Integer.class).single())
                .as("nothing was squeezed in beside the existing booking").isEqualTo(1);
    }

    private int otaBookings(String state) {
        return admin.sql("select count(*) from bookings where property_id = ? and source = 'ota' and state = ?::booking_state")
                .params(property, state).query(Integer.class).single();
    }

    private <T> T asDesk(java.util.function.Supplier<T> body) {
        return TenantContext.runAs(property, body);
    }
}
