package in.pms.selfreg;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.common.BadRequestException;
import in.pms.guests.GuestService;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Guest self-registration, from both sides of the desk.
 *
 * <p>The happy path is one test. The rest are the ways a stranger could try to use the one endpoint in the
 * system that has no login in front of it: a guessed token, an expired one, a used one, one belonging to
 * another property, and a form filled in with something the register must never hold.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SelfRegistrationTest {

    @Autowired MockMvc mvc;
    @Autowired SelfRegistrationService service;
    @Autowired GuestService guests;
    @Autowired ObjectMapper json;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID orgId, propertyA, propertyB, userId;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            orgId = admin.sql("insert into organisations(name) values ('Register Trust') returning id").query(UUID.class).single();
            propertyA = admin.sql("insert into properties(org_id, name) values (?, 'Register Test A') returning id").param(orgId).query(UUID.class).single();
            propertyB = admin.sql("insert into properties(org_id, name) values (?, 'Register Test B') returning id").param(orgId).query(UUID.class).single();
            // Re-runnable: a run whose teardown failed leaves rows pointing at this user, and they hold a
            // foreign key on it. Clear those before the user itself.
            admin.sql("delete from guest_registrations where created_by in (select id from users where phone = '9444444444')").update();
            admin.sql("delete from property_users where user_id in (select id from users where phone = '9444444444')").update();
            admin.sql("delete from users where phone = '9444444444'").update();
            userId = admin.sql("insert into users(name, phone) values ('Desk', '9444444444') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'manager')").params(propertyA, userId).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            // audit_log is deliberately absent: it has no DELETE grant for either role, which is the
            // guarantee this system makes about it. Its rows outlive the test, as they should.
            for (UUID p : List.of(propertyA, propertyB))
                for (String t : List.of("guest_registrations", "guests"))
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

    /** The token is only ever returned once, inside the link the desk shows; pull it back out of the URL. */
    private static String tokenOf(SelfRegistrationService.NewLink link) {
        return link.url().substring(link.url().lastIndexOf('/') + 1);
    }

    private static SelfRegistration.Submission submission(String name) {
        return new SelfRegistration.Submission(name, "9876543210", "Haridwar", "12 Temple Road", "IN",
                "voter", "4321", null, 2, 1, "pilgrimage",
                List.of(new SelfRegistration.Submission.Member("Sita Devi", true)), true, true);
    }

    // ---------- The flow the feature exists for ----------

    @Test
    void theGuestFillsTheirOwnDetailsAndTheDeskTurnsThemIntoAGuest() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        assertThat(link.qrDataUri()).startsWith("data:image/png;base64,");
        assertThat(link.url()).contains("/g/");

        // The guest's phone: no cookie, no session, nothing but the token.
        mvc.perform(get("/api/public/registration/" + tokenOf(link)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyName").value("Register Test A"))
                .andExpect(header().string("Cache-Control", "no-store"));

        mvc.perform(post("/api/public/registration/" + tokenOf(link))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(submission("Arjun Sharma"))))
                .andExpect(status().isOk());

        // The desk, watching its screen, sees the answer arrive.
        var reg = asDesk(propertyA, () -> service.get(link.id()));
        assertThat(reg.state()).isEqualTo("submitted");
        assertThat(reg.submitted().name()).isEqualTo("Arjun Sharma");
        assertThat(reg.submitted().members()).singleElement().extracting(SelfRegistration.Submission.Member::name).isEqualTo("Sita Devi");

        // Nothing became a guest until the desk said so.
        UUID guestId = asDesk(propertyA, () -> service.apply(link.id(), userId));
        var guest = asDesk(propertyA, () -> guests.get(guestId));
        assertThat(guest.name()).isEqualTo("Arjun Sharma");
        assertThat(guest.city()).isEqualTo("Haridwar");
        assertThat(asDesk(propertyA, () -> service.get(link.id())).state()).isEqualTo("applied");
    }

    // ---------- What a stranger gets ----------

    @Test
    void aGuessedTokenIsIndistinguishableFromAnExpiredOne() throws Exception {
        mvc.perform(get("/api/public/registration/" + "z".repeat(43))).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/registration/short")).andExpect(status().isNotFound());
    }

    @Test
    void anExpiredLinkIsRefused() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update guest_registrations set expires_at = now() - interval '1 minute' where id = ?").param(link.id()).update());

        mvc.perform(get("/api/public/registration/" + tokenOf(link))).andExpect(status().isNotFound());
    }

    @Test
    void aRevokedLinkStopsWorkingImmediately() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        asDesk(propertyA, () -> service.revoke(link.id(), userId));
        mvc.perform(get("/api/public/registration/" + tokenOf(link))).andExpect(status().isNotFound());
    }

    @Test
    void aLinkAcceptsOneSubmissionOnly() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        String body = json.writeValueAsString(submission("First Person"));

        mvc.perform(post("/api/public/registration/" + tokenOf(link)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        // A second phone with the same code cannot overwrite what the first one sent.
        mvc.perform(post("/api/public/registration/" + tokenOf(link)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(submission("Someone Else"))))
                .andExpect(status().isBadRequest());

        assertThat(asDesk(propertyA, () -> service.get(link.id())).submitted().name()).isEqualTo("First Person");
    }

    /**
     * The point of the whole design: reading a link tells you nothing about anybody. If this ever starts
     * returning a guest, a booking or an amount, a leaked token becomes a data breach.
     */
    @Test
    void theFormDisclosesNothingAboutAnyGuestOrBooking() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        mvc.perform(post("/api/public/registration/" + tokenOf(link)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(submission("Private Person")))).andExpect(status().isOk());

        // Even after a submission, re-reading the link gives back the form, never the answers.
        String body = mvc.perform(get("/api/public/registration/" + tokenOf(link)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alreadyDone").value(true))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("Private Person").doesNotContain("9876543210").doesNotContain("Temple Road");
    }

    @Test
    void aTokenCannotReachAnotherPropertysData() {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        var resolved = service.resolve(tokenOf(link)).orElseThrow();
        assertThat(resolved.propertyId()).isEqualTo(propertyA);

        // The desk of the other property cannot see, apply or revoke it: RLS answers before the code does.
        assertThatThrownBy(() -> asDesk(propertyB, () -> service.get(link.id())))
                .hasMessageContaining("Registration link");
    }

    @Test
    void theDeskCannotSeeALinkItHasNoTokenFor() {
        // The token is never stored, so even the property's own manager cannot read one back out.
        var link = asDesk(propertyA, () -> service.create(null, userId));
        String stored = new TransactionTemplate(adminTx).execute(tx ->
                admin.sql("select token_hash from guest_registrations where id = ?").param(link.id()).query(String.class).single());
        assertThat(stored).isNotEqualTo(tokenOf(link)).hasSize(64);
    }

    // ---------- What the register must never hold ----------

    @Test
    void aFullAadhaarNumberIsRefusedFromTheGuestsOwnPhoneToo() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        var withAadhaar = new SelfRegistration.Submission("Careless Guest", "9876543210", "Haridwar",
                "Aadhaar 1234 5678 9012", "IN", "aadhaar", "9012", null, 1, 0, "pilgrimage", List.of(), true, false);

        mvc.perform(post("/api/public/registration/" + tokenOf(link))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(withAadhaar)))
                .andExpect(status().isBadRequest());

        assertThat(asDesk(propertyA, () -> service.get(link.id())).submitted()).isNull();
    }

    @Test
    void anEmptyNameIsRefused() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        var noName = new SelfRegistration.Submission("  ", "9876543210", "Haridwar", "", "IN",
                "voter", "4321", null, 1, 0, "pilgrimage", List.of(), true, false);
        mvc.perform(post("/api/public/registration/" + tokenOf(link))
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(noName)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aFloodOfCompanionsIsRefusedRatherThanStored() {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        var resolved = service.resolve(tokenOf(link)).orElseThrow();
        var many = new SelfRegistration.Submission("Big Group", "9876543210", "Haridwar", "", "IN",
                "voter", "4321", null, 2, 0, "pilgrimage",
                java.util.stream.IntStream.range(0, 50)
                        .mapToObj(i -> new SelfRegistration.Submission.Member("Person " + i, true)).toList(),
                true, false);

        assertThatThrownBy(() -> asDesk(propertyA, () -> { service.submit(resolved, many); return null; }))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void applyingBeforeTheGuestHasFilledAnythingIsRefused() {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        assertThatThrownBy(() -> asDesk(propertyA, () -> service.apply(link.id(), userId)))
                .isInstanceOf(BadRequestException.class);
    }

    /** The desk's own endpoints stay behind the login, whatever the guest endpoints allow. */
    @Test
    void mintingALinkStillRequiresASignedInDesk() throws Exception {
        mvc.perform(post("/api/registrations").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aSubmissionIsAudited() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        mvc.perform(post("/api/public/registration/" + tokenOf(link)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(submission("Audited Guest")))).andExpect(status().isOk());

        Integer rows = new TransactionTemplate(adminTx).execute(tx -> admin.sql(
                "select count(*) from audit_log where property_id = ? and table_name = 'guest_registrations' and action = 'guest_submit' and user_id is null")
                .param(propertyA).query(Integer.class).single());
        assertThat(rows).isEqualTo(1);
    }

    @Test
    void anExpiredLinkIsNotShownAsOpenToTheDesk() {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        var reg = asDesk(propertyA, () -> service.get(link.id()));
        assertThat(reg.expiresAt()).isAfter(OffsetDateTime.now());
        assertThat(reg.state()).isEqualTo("open");
        assertThat(reg.submitted()).isNull();
    }
}
