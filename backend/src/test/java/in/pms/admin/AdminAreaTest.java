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
        // Counts and status only: nothing that identifies a guest.
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("guestName", "phone", "idLast4");
    }

    @Test
    void onboardingCreatesAPropertyWithItsFirstOwner() throws Exception {
        Cookie cookie = signIn(superEmail);
        mvc.perform(post("/api/admin/properties").cookie(cookie).header("X-Requested-With", "pms")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"orgName":"Onboarded Trust","propertyName":"New Dharamshala","city":"Rishikesh",
                                 "state":"Uttarakhand","phone":"0135-000000","ownerName":"New Owner",
                                 "ownerPhone":"9555500001","ownerEmail":null,"planCode":"basic"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyId").exists())
                .andExpect(jsonPath("$.ownerPhone", is("9555500001")));

        Integer memberships = admin.sql("""
                select count(*) from property_users pu join users u on u.id = pu.user_id
                join properties p on p.id = pu.property_id
                where u.phone = '9555500001' and pu.role = 'owner' and p.name = 'New Dharamshala'""")
                .query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(memberships).isEqualTo(1);
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

    @Test
    void readingAPropertysActivityIsItselfLogged() throws Exception {
        mvc.perform(get("/api/admin/properties/" + propertyId + "/activity").cookie(signIn(superEmail))).andExpect(status().isOk());
        Integer logged = admin.sql("select count(*) from audit_log where property_id = ? and action = 'admin_view'").param(propertyId).query(Integer.class).single();
        org.assertj.core.api.Assertions.assertThat(logged).isPositive();
    }

    @Test
    void supportAccessToGuestDataNeedsTheOwnersConsentWindow() {
        AdminService service = new AdminService(admin, passwords, new in.pms.audit.AuditService(admin, admin, new com.fasterxml.jackson.databind.ObjectMapper()));
        var actor = new in.pms.auth.CurrentUser(superAdminId, "Support", true, UUID.randomUUID(), null, null, List.of());

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
