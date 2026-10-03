package in.pms.admin;

import jakarta.servlet.http.Cookie;
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

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The back office crosses tenant boundaries, so it gets its own checks: only a super-admin may open it,
 * it reports health without guest data, and reading a property's activity is logged against that property.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdminAreaTest {
    @Autowired MockMvc mvc;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired in.pms.auth.PasswordService passwords;
    @Autowired in.pms.integrations.storage.StorageProvider storage;
    @Autowired in.pms.auth.SessionService sessions;
    @Autowired in.pms.config.RoomDefaults roomDefaults;
    @Autowired in.pms.inventory.DefaultInventory defaultInventory;

    UUID orgId, propertyId, superAdminId, ownerId;
    final String superEmail = "superadmin@test.local", ownerEmail = "adminowner@test.local";

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from property_users where user_id in (select id from users where email in (?, ?))").params(superEmail, ownerEmail).update();
            admin.sql("delete from users where email in (?, ?)").params(superEmail, ownerEmail).update();
            String hash = passwords.hash("password123");
            superAdminId = admin.sql("insert into users(name, email, password_hash, is_super_admin) values ('Support', ?, ?, true) returning id")
                    .params(superEmail, hash).query(UUID.class).single();
            ownerId = admin.sql("insert into users(name, email, password_hash) values ('Owner', ?, ?) returning id")
                    .params(ownerEmail, hash).query(UUID.class).single();
            orgId = admin.sql("insert into organisations(name) values ('Admin Trust') returning id").query(UUID.class).single();
            propertyId = admin.sql("insert into properties(org_id, name, city) values (?, 'Admin Test', 'Haridwar') returning id").param(orgId).query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'owner')").params(propertyId, ownerId).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from sessions where user_id in (?, ?)").params(superAdminId, ownerId).update();
            // Anything the tests onboarded, plus the fixture itself.
            List<UUID> orgs = admin.sql("select id from organisations where name in ('Admin Trust', 'Onboarded Trust')").query(UUID.class).list();
            for (UUID org : orgs) {
                admin.sql("delete from property_users where property_id in (select id from properties where org_id = ?)").param(org).update();
                // An onboarded property arrives with its floor plan, so the rooms go before the property can.
                admin.sql("delete from rooms where property_id in (select id from properties where org_id = ?)").param(org).update();
                admin.sql("delete from floors where property_id in (select id from properties where org_id = ?)").param(org).update();
                admin.sql("delete from room_types where property_id in (select id from properties where org_id = ?)").param(org).update();
                admin.sql("delete from properties where org_id = ?").param(org).update();
                admin.sql("delete from organisations where id = ?").param(org).update();
            }
            admin.sql("delete from users where email in (?, ?) or phone = '9555500001'").params(superEmail, ownerEmail).update();
        });
    }

    Cookie signIn(String email) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password123\"}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        String header = response.getHeader("Set-Cookie");
        return new Cookie("pms_session", header.substring("pms_session=".length(), header.indexOf(';')));
    }

    @Test
    void anOwnerCannotOpenTheBackOffice() throws Exception {
        mvc.perform(get("/api/admin/properties").cookie(signIn(ownerEmail))).andExpect(status().isForbidden());
    }

    @Test
    void anonymousCallersCannotOpenTheBackOffice() throws Exception {
        mvc.perform(get("/api/admin/properties")).andExpect(status().isUnauthorized());
    }

    /**
     * A signed-in user who is merely not allowed must get 403, never 401. The difference matters: the app
     * treats 401 as "your session ended" and sends the person back to the login screen, which would be both
     * confusing and a way to hide real authorization failures.
     */
    @Test
    void beingSignedInButNotAllowedIsForbiddenNotUnauthorised() throws Exception {
        mvc.perform(get("/api/admin/properties").cookie(signIn(ownerEmail)))
                .andExpect(status().isForbidden());
    }

    @Test
    void healthShowsCountsAndNoGuestData() throws Exception {
        String body = mvc.perform(get("/api/admin/properties").cookie(signIn(superEmail)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.propertyName == 'Admin Test')]").exists())
                .andReturn().getResponse().getContentAsString();
        // Counts, status and the trust's own contacts: nothing that identifies a guest.
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("guestName", "guestPhone", "idLast4");
    }

    @Test
    void onboardingCreatesAPropertyWithItsFirstOwner() throws Exception {
        Cookie cookie = signIn(superEmail);
        mvc.perform(post("/api/admin/properties").cookie(cookie).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"orgName":"Onboarded Trust","propertyName":"New Dharamshala","city":"Rishikesh",
                                 "state":"Uttarakhand","phone":"0135-000000","ownerName":"New Owner",
                                 "ownerPhone":"9555500001","ownerEmail":"newowner@test.local","planCode":"basic"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyId").exists())
                .andExpect(jsonPath("$.ownerPhone", is("9555500001")))
                .andExpect(jsonPath("$.ownerEmail", is("newowner@test.local")));

        Integer memberships = admin.sql("""
                select count(*) from property_users pu join users u on u.id = pu.user_id
                join properties p on p.id = pu.property_id
                where u.phone = '9555500001' and pu.role = 'owner' and p.name = 'New Dharamshala'""")
                .query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(memberships).isEqualTo(1);

        // The property opens with the configured floor plan already in it, so the desk is not looking at an
        // empty rooms screen: three floors of 10, 10 and 5 — twenty-five rooms, 101-110, 201-210, 301-305.
        var floors = admin.sql("""
                select r.floor, count(*) as n from rooms r join properties p on p.id = r.property_id
                where p.name = 'New Dharamshala' group by r.floor order by r.floor""").query().listOfRows();
        org.assertj.core.api.Assertions.assertThat(floors).hasSize(3);
        org.assertj.core.api.Assertions.assertThat(floors.stream().map(f -> (Long) f.get("n")))
                .containsExactly(10L, 10L, 5L);
        // The count is whatever the configured plan adds up to; nothing in the code says twenty-five.
        org.assertj.core.api.Assertions.assertThat(floors.stream().mapToLong(f -> (Long) f.get("n")).sum())
                .isEqualTo(roomDefaults.defaultRoomCount());
        org.assertj.core.api.Assertions.assertThat(admin.sql("""
                select count(*) from rooms r join properties p on p.id = r.property_id
                where p.name = 'New Dharamshala' and r.number in ('101', '110', '201', '210', '301', '305')""")
                .query(Integer.class).single()).isEqualTo(6);
        // Each floor has a row to be named through, and no room was given another property's room type.
        org.assertj.core.api.Assertions.assertThat(admin.sql("""
                select count(*) from floors f join properties p on p.id = f.property_id where p.name = 'New Dharamshala'""")
                .query(Integer.class).single()).isEqualTo(3);
        org.assertj.core.api.Assertions.assertThat(admin.sql("""
                select count(*) from rooms r join room_types t on t.id = r.room_type_id
                join properties p on p.id = r.property_id
                where p.name = 'New Dharamshala' and t.property_id <> r.property_id""")
                .query(Integer.class).single()).isZero();
    }

    @Test
    void billingStatusIsChangeableAndAudited() throws Exception {
        mvc.perform(patch("/api/admin/organisations/" + orgId + "/billing").cookie(signIn(superEmail))
                        .header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"billingStatus\":\"overdue\"}"))
                .andExpect(status().isNoContent());

        String status = admin.sql("select billing_status::text from organisations where id = ?").param(orgId).query(String.class).single();
        org.assertj.core.api.Assertions.assertThat(status).isEqualTo("overdue");
        Integer audited = admin.sql("select count(*) from audit_log where row_id = ? and action = 'billing_status'").param(orgId.toString()).query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(audited).isPositive();
    }

    /** The billing state the platform sets is what the desk lives under: it is not a label. */
    @Test
    void billingStateGatesTheDesk() throws Exception {
        Cookie owner = signIn(ownerEmail);
        setBilling("active");
        mvc.perform(get("/api/property").cookie(owner)).andExpect(status().isOk());

        setBilling("readonly");
        mvc.perform(get("/api/property").cookie(signIn(ownerEmail))).andExpect(status().isOk());
        mvc.perform(put("/api/property").cookie(signIn(ownerEmail)).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Admin Test\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error", containsString("read-only")));

        setBilling("closed");
        mvc.perform(get("/api/property").cookie(signIn(ownerEmail))).andExpect(status().isForbidden());
        // The person can still learn why, and leave.
        mvc.perform(get("/api/auth/me").cookie(signIn(ownerEmail))).andExpect(status().isOk()).andExpect(jsonPath("$.billingStatus").value("closed"));

        setBilling("active");
        mvc.perform(get("/api/property").cookie(signIn(ownerEmail))).andExpect(status().isOk());
    }

    private void setBilling(String status) {
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update organisations set billing_status = ?::billing_status where id = ?").params(status, orgId).update());
    }

    @Test
    void platformCanSetAndClearAPropertysPhoto() throws Exception {
        Cookie support = signIn(superEmail);
        byte[] png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==");
        mvc.perform(multipart("/api/admin/properties/" + propertyId + "/photo")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "photo.png", "image/png", png))
                        .cookie(support).header("X-Requested-With", "pms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photoUrl", containsString("/api/files/")));
        // Something that is not a photo is refused before it is stored.
        mvc.perform(multipart("/api/admin/properties/" + propertyId + "/photo")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "notes.txt", "text/plain", "hello".getBytes()))
                        .cookie(support).header("X-Requested-With", "pms"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/properties/" + propertyId).cookie(support))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photoUrl", containsString("/api/files/")));
        mvc.perform(delete("/api/admin/properties/" + propertyId + "/photo").cookie(support).header("X-Requested-With", "pms"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photoUrl").doesNotExist());
    }

    /** Off means off for the people who work there, and nothing is lost when it comes back on. */
    @Test
    void switchingAPropertyOffHidesItFromItsOwnStaff() throws Exception {
        Cookie support = signIn(superEmail);
        mvc.perform(patch("/api/admin/properties/" + propertyId + "/active").cookie(support).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/auth/me").cookie(signIn(ownerEmail))).andExpect(status().isOk()).andExpect(jsonPath("$.propertyId").doesNotExist());
        mvc.perform(patch("/api/admin/properties/" + propertyId + "/active").cookie(support).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"active\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        mvc.perform(get("/api/auth/me").cookie(signIn(ownerEmail))).andExpect(status().isOk()).andExpect(jsonPath("$.propertyId").value(propertyId.toString()));
    }

    @Test
    void platformNotesRoundTripAndStayOffTheOwnersScreens() throws Exception {
        Cookie support = signIn(superEmail);
        mvc.perform(patch("/api/admin/properties/" + propertyId + "/notes").cookie(support).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"Owner asked about GST on 20 Sep.\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notes").value("Owner asked about GST on 20 Sep."));
        // The property's own record carries no trace of it.
        String own = mvc.perform(get("/api/property").cookie(signIn(ownerEmail))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(own).doesNotContain("GST on 20 Sep");
    }

    @Test
    void platformCanResetAStaffPasswordAndItWorksAtOnce() throws Exception {
        Cookie support = signIn(superEmail);
        String body = mvc.perform(post("/api/admin/properties/" + propertyId + "/team/" + ownerId + "/password").cookie(support).header("X-Requested-With", "pms"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.password").isNotEmpty()).andReturn().getResponse().getContentAsString();
        String fresh = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).get("password").asText();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + ownerEmail + "\",\"password\":\"" + fresh + "\"}"))
                .andExpect(status().isOk());
        // A platform admin cannot be reset through a property.
        mvc.perform(post("/api/admin/properties/" + propertyId + "/team/" + superAdminId + "/password").cookie(support).header("X-Requested-With", "pms"))
                .andExpect(status().isNotFound());
        // Put the fixture's password back so the other tests can sign in as the owner.
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update users set password_hash = ?, must_change_password = false where id = ?").params(passwords.hash("password123"), ownerId).update());
    }

    @Test
    void readingAPropertysActivityIsItselfLogged() throws Exception {
        mvc.perform(get("/api/admin/properties/" + propertyId + "/activity").cookie(signIn(superEmail))).andExpect(status().isOk());
        Integer logged = admin.sql("select count(*) from audit_log where property_id = ? and action = 'admin_view'").param(propertyId).query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(logged).isPositive();
    }

    @Test
    void supportAccessToGuestDataNeedsTheOwnersConsentWindow() {
        AdminService service = new AdminService(admin, passwords, new in.pms.audit.AuditService(admin, admin, new com.fasterxml.jackson.databind.ObjectMapper()), storage, sessions, defaultInventory);
        var actor = new in.pms.auth.CurrentUser(superAdminId, "Support", true, UUID.randomUUID(), null, null, List.of(), null, java.util.Set.of());

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                new TransactionTemplate(adminTx).executeWithoutResult(tx -> service.requireSupportAccess(propertyId, actor, "guest list")))
                .hasMessageContaining("not granted support access");

        // The owner opens a window in their settings; only then may support look.
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update properties set settings = jsonb_set(settings, '{support_access_until}', to_jsonb(?::text)) where id = ?")
                        .params(OffsetDateTime.now().plusHours(2).toString(), propertyId).update());
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> service.requireSupportAccess(propertyId, actor, "guest list"));

        Integer logged = admin.sql("select count(*) from audit_log where property_id = ? and action = 'support_read'").param(propertyId).query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(logged).isPositive();
    }
}
