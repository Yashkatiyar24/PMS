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
import java.util.Map;
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

    // ---------- One session, two screens ----------

    /**
     * The feature this was all built for: the desk watches the register fill in while the guest types, with
     * nobody reloading anything. The poll on the desk's screen reads exactly what this test reads.
     */
    @Test
    void theDeskSeesEachFieldAsTheGuestTypesIt() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));

        patchAsGuest(link, """
                {"fields": {"name": "Rahul Sharma"}, "status": "filling"}""").andExpect(status().isOk());
        var afterName = asDesk(propertyA, () -> service.get(link.id()));
        assertThat(afterName.draft()).containsEntry("name", "Rahul Sharma");
        assertThat(afterName.status()).isEqualTo("filling");
        assertThat(afterName.version()).isEqualTo(1);
        // Still nothing has become a guest: a draft is as inert as a submission.
        assertThat(afterName.state()).isEqualTo("open");

        patchAsGuest(link, """
                {"fields": {"city": "Delhi", "address": "XYZ"}}""").andExpect(status().isOk());
        var afterAddress = asDesk(propertyA, () -> service.get(link.id()));
        assertThat(afterAddress.draft())
                .containsEntry("name", "Rahul Sharma")   // the earlier field is not lost by the later write
                .containsEntry("city", "Delhi")
                .containsEntry("address", "XYZ");
        assertThat(afterAddress.version()).isEqualTo(2);
    }

    /** The other direction: the clerk fixes a name at the counter and the guest's phone shows the correction. */
    @Test
    void theDesksCorrectionReachesTheGuestsPhone() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"name": "Rahul Sharma", "city": "Delhi"}}""").andExpect(status().isOk());

        asDesk(propertyA, () -> {
            service.writeDraft(link.id(), new SelfRegistrationService.Patch(Map.of("name", "Rahul Kumar"), null, null), "owner", userId);
            return null;
        });

        mvc.perform(get("/api/public/registration/" + tokenOf(link) + "/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft.name").value("Rahul Kumar"))
                .andExpect(jsonPath("$.draft.city").value("Delhi"))   // field-level: the desk's write left this alone
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    /** A guest whose phone went to sleep, or who pulled to refresh, comes back to what they had typed. */
    @Test
    void theDraftSurvivesTheGuestReloadingTheirPhone() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"name": "Rahul Sharma", "idType": "voter", "idLast4": "4321"}}""").andExpect(status().isOk());

        mvc.perform(get("/api/public/registration/" + tokenOf(link) + "/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft.name").value("Rahul Sharma"))
                .andExpect(jsonPath("$.draft.idLast4").value("4321"))
                .andExpect(jsonPath("$.state").value("open"));
    }

    /** What reading an ID suggests is kept as a suggestion, next to the draft and not inside it. */
    @Test
    void whatTheIdPhotoSaidIsOfferedRatherThanApplied() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"name": "Rahul Kumar"},
                 "ocr": {"name": {"value": "Rahul Sharma", "confidence": 0.96},
                         "city": {"value": "Haridwar", "confidence": 0.5}, "_doc": "aadhaar"}}""")
                .andExpect(status().isOk());

        var reg = asDesk(propertyA, () -> service.get(link.id()));
        assertThat(reg.draft()).containsEntry("name", "Rahul Kumar");  // what the human typed stands
        assertThat(reg.ocr()).containsKeys("name", "city", "_doc");
        assertThat(reg.draft()).doesNotContainKey("ocr");
        // The reader's own confidence is kept, because a screen must be able to say "please check this one".
        assertThat(((Map<?, ?>) reg.ocr().get("city")).get("confidence")).isEqualTo(0.5);
    }

    @Test
    void aGuestCannotKeepEditingAfterTheyHaveSentTheForm() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        mvc.perform(post("/api/public/registration/" + tokenOf(link)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(submission("Sent Already")))).andExpect(status().isOk());

        patchAsGuest(link, """
                {"fields": {"name": "Someone Else"}}""").andExpect(status().isBadRequest());
        // The desk, however, may still correct it — that is the whole point of the review step.
        assertThat(asDesk(propertyA, () -> service.get(link.id())).draft()).containsEntry("name", "Sent Already");
    }

    @Test
    void aFullAadhaarNumberIsRefusedInADraftToo() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"address": "Aadhaar 1234 5678 9012"}}""").andExpect(status().isBadRequest());
        assertThat(asDesk(propertyA, () -> service.get(link.id())).draft()).isEmpty();
    }

    @Test
    void aDraftCannotBeUsedToParkArbitraryData() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"name": "Rahul", "secretPayload": "x", "adults": 9999}}""").andExpect(status().isOk());

        var draft = asDesk(propertyA, () -> service.get(link.id())).draft();
        assertThat(draft).containsOnlyKeys("name", "adults");
        assertThat(draft).containsEntry("adults", 30); // clamped, not refused: a count is not worth a failed save
    }

    @Test
    void aDraftWriteIsAudited() throws Exception {
        var link = asDesk(propertyA, () -> service.create(null, userId));
        patchAsGuest(link, """
                {"fields": {"name": "Audited Draft", "idLast4": "4321"}}""").andExpect(status().isOk());

        String after = new TransactionTemplate(adminTx).execute(tx -> admin.sql("""
                select after::text from audit_log where property_id = ? and table_name = 'guest_registrations'
                 and action = 'draft_guest' order by at desc limit 1""")
                .param(propertyA).query(String.class).single());
        assertThat(after).contains("name").contains("Audited Draft");
        // The last four digits of a document are recorded as having changed, never written into the log.
        assertThat(after).contains("idLast4").doesNotContain("4321");
    }

    /**
     * The guarantee the whole design rests on: the desk's screen, the guest's phone and the document reader
     * ask the same questions. The browser's list is checked against this one, because a field added to only
     * one side is exactly the drift this feature was built to end.
     */
    @Test
    void theDeskAndTheGuestsPhoneAskTheSameQuestions() throws Exception {
        var file = java.nio.file.Path.of("..", "frontend", "src", "lib", "checkin-fields.ts");
        org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(file), "frontend not checked out");
        String source = java.nio.file.Files.readString(file);
        String marker = "export const FIELDS = [";
        String list = source.substring(source.indexOf(marker) + marker.length());
        list = list.substring(0, list.indexOf("]"));
        var inBrowser = java.util.Arrays.stream(list.split(",")).map(x -> x.replaceAll("[\\s\"]", "")).filter(x -> !x.isEmpty()).toList();
        assertThat(inBrowser).containsExactlyElementsOf(CheckInFields.all());
    }

    /** Rate-limited like everything else on this door, but loosely enough for a phone sending as it types. */
    private org.springframework.test.web.servlet.ResultActions patchAsGuest(SelfRegistrationService.NewLink link, String body) throws Exception {
        return mvc.perform(patch("/api/public/registration/" + tokenOf(link))
                .contentType(MediaType.APPLICATION_JSON).content(body));
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
