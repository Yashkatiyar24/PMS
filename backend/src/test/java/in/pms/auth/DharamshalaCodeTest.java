package in.pms.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A dharamshala signs a deal: we onboard it, it gets its code, and its people sign in with the code, their email
 * and a password. It starts with the basics; each extra part is switched on for it alone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DharamshalaCodeTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordService passwords;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    static final String SUPER = "codeadmin@test.local";
    static final List<String> PHONES = List.of("9555600001", "9555600002", "9555600003", "9555600008", "9555600009");
    UUID otherOrg, otherProperty;
    String otherCode;

    @BeforeAll
    void setUp() {
        tearDown();
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("insert into users(name, email, password_hash, is_super_admin) values ('Platform', ?, ?, true)").params(SUPER, passwords.hash("password123")).update();
            // Somebody else's dharamshala, with one person working there.
            otherOrg = admin.sql("insert into organisations(name) values ('Other Code Trust') returning id").query(UUID.class).single();
            var p = admin.sql("insert into properties(org_id, name) values (?, 'Other Code Place') returning id, code").param(otherOrg).query().singleRow();
            otherProperty = (UUID) p.get("id");
            otherCode = (String) p.get("code");
            UUID elsewhere = admin.sql("insert into users(name, phone, email, password_hash) values ('Elsewhere', '9555600009', 'p9555600009@code.test', ?) returning id").param(passwords.hash("elsewhere1")).query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'receptionist')").params(otherProperty, elsewhere).update();
            UUID guessed = admin.sql("insert into users(name, phone, email, password_hash) values ('Guessed', '9555600008', 'p9555600008@code.test', ?) returning id").param(passwords.hash("guessed-12")).query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'receptionist')").params(otherProperty, guessed).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            String users = "select id from users where email = '" + SUPER + "' or phone in ('" + String.join("','", PHONES) + "')";
            admin.sql("delete from sessions where user_id in (" + users + ")").update();
            List<UUID> orgs = admin.sql("select id from organisations where name in ('Code Trust', 'Other Code Trust')").query(UUID.class).list();
            for (UUID org : orgs) {
                admin.sql("delete from property_users where property_id in (select id from properties where org_id = ?)").param(org).update();
                admin.sql("delete from notifications where property_id in (select id from properties where org_id = ?)").param(org).update();
                admin.sql("delete from properties where org_id = ?").param(org).update();
                admin.sql("delete from organisations where id = ?").param(org).update();
            }
            admin.sql("delete from property_users where user_id in (" + users + ")").update();
            admin.sql("delete from users where id in (" + users + ")").update();
        });
    }

    ResultActions login(String body) throws Exception {
        return mvc.perform(post("/api/auth/login").header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    Cookie signIn(String body) throws Exception {
        String header = login(body).andExpect(status().isOk()).andReturn().getResponse().getHeader("Set-Cookie");
        return new Cookie("pms_session", header.substring("pms_session=".length(), header.indexOf(';')));
    }

    static String byCode(String code, String email, String password) {
        return "{\"code\":\"" + code + "\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    JsonNode call(Cookie who, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, int status) throws Exception {
        String body = mvc.perform(request.cookie(who).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
        return body.isBlank() ? null : json.readTree(body);
    }

    /** A password handed out opens nothing until it is replaced; the session that replaces it stays signed in. */
    Cookie ownPassword(Cookie who, String handed) throws Exception {
        call(who, post("/api/users/me/password").content("{\"currentPassword\":\"" + handed + "\",\"password\":\"owner-own-pass\"}"), 204);
        return who;
    }

    @Test
    void aDharamshalaGetsItsCodeAndStartsWithTheBasics() throws Exception {
        Cookie platform = signIn("{\"email\":\"" + SUPER + "\",\"password\":\"password123\"}");
        JsonNode onboarded = call(platform, post("/api/admin/properties").content("""
                {"orgName":"Code Trust","propertyName":"Ganga Seva Sadan","city":"Haridwar","ownerName":"Owner","ownerPhone":"9555600001","ownerEmail":"p9555600001@code.test","planCode":"basic"}"""), 200);
        String code = onboarded.get("code").asText();
        String ownerPassword = onboarded.get("ownerPassword").asText();
        String propertyId = onboarded.get("propertyId").asText();
        assertThat(code).matches("GSS\\d{4}");
        assertThat(ownerPassword).hasSize(10);

        // Typed the way people type it: lower case code, stray spaces, a capital in the email.
        Cookie owner = ownPassword(signIn(byCode(" " + code.toLowerCase() + " ", " P9555600001@Code.test ", ownerPassword)), ownerPassword);
        JsonNode me = call(owner, get("/api/auth/me"), 200);
        assertThat(me.get("propertyId").asText()).isEqualTo(propertyId);
        List<String> can = json.convertValue(me.get("permissions"), json.getTypeFactory().constructCollectionType(List.class, String.class));
        assertThat(can).contains("checkin", "checkout", "reservations.create", "revenue.view", "staff.manage")
                .doesNotContain("restaurant", "inventory", "expenses", "maintenance", "maintenance.report", "lost_found", "audit.view");

        // Hidden parts are closed at the server too, not only missing from the screens.
        for (String path : List.of("/api/restaurant/menu", "/api/inventory/items", "/api/lost-found", "/api/audit/tables", "/api/maintenance"))
            call(owner, get(path), 403);
        call(owner, post("/api/restaurant/menu").content("{\"name\":\"Thali\",\"pricePaise\":10000}"), 403);

        // We switch parts on for this dharamshala alone, and its owner can use them on the next request.
        call(platform, patch("/api/admin/properties/" + propertyId + "/modules").content("{\"modules\":[\"restaurant\",\"lost_found\"]}"), 204);
        call(owner, get("/api/restaurant/menu"), 200);
        call(owner, get("/api/lost-found"), 200);
        call(owner, get("/api/inventory/items"), 403);
        call(platform, patch("/api/admin/properties/" + propertyId + "/modules").content("{\"modules\":[\"casino\"]}"), 400);
        call(owner, patch("/api/admin/properties/" + propertyId + "/modules").content("{\"modules\":[\"audit\"]}"), 403);
        assertThat(call(owner, get("/api/property"), 200).get("code").asText()).isEqualTo(code);
    }

    @Test
    void theOwnerAddsStaffWhoSignInWithTheSameCode() throws Exception {
        Cookie platform = signIn("{\"email\":\"" + SUPER + "\",\"password\":\"password123\"}");
        JsonNode onboarded = call(platform, post("/api/admin/properties").content("""
                {"orgName":"Code Trust","propertyName":"Seva Bhawan","ownerName":"Owner","ownerPhone":"9555600003","ownerEmail":"p9555600003@code.test","planCode":"basic"}"""), 200);
        String code = onboarded.get("code").asText();
        String handed = onboarded.get("ownerPassword").asText();
        // Without an email nobody could sign in, so onboarding and inviting both refuse it.
        call(platform, post("/api/admin/properties").content("""
                {"orgName":"Code Trust","propertyName":"No Email","ownerName":"Owner","ownerPhone":"9555600003","planCode":"basic"}"""), 400);
        Cookie owner = ownPassword(signIn(byCode(code, "p9555600003@code.test", handed)), handed);

        // Somebody who works at another dharamshala cannot get in here with that one's password.
        login(byCode(code, "p9555600009@code.test", "elsewhere1")).andExpect(status().isBadRequest());
        login(byCode(otherCode, "p9555600009@code.test", "elsewhere1")).andExpect(status().isOk());

        JsonNode invited = call(owner, post("/api/users").content("{\"name\":\"Desk\",\"phone\":\"9555600002\",\"email\":\"p9555600002@code.test\",\"role\":\"receptionist\"}"), 200);
        String first = invited.get("password").asText();
        call(owner, post("/api/users").content("{\"name\":\"Desk\",\"phone\":\"9555600002\",\"role\":\"receptionist\"}"), 400);
        signIn(byCode(code, "p9555600002@code.test", first));
        String deskId = invited.get("userId").asText();

        // Their existing account is not ours to open: no password is handed out for it, and it cannot be reset here.
        JsonNode borrowed = call(owner, post("/api/users").content("{\"name\":\"Elsewhere\",\"phone\":\"9555600009\",\"email\":\"p9555600009@code.test\",\"role\":\"receptionist\"}"), 200);
        assertThat(borrowed.hasNonNull("password")).isFalse();
        call(owner, post("/api/users/" + borrowed.get("userId").asText() + "/password"), 403);

        // A forgotten password: the owner resets it, the old one stops working and the new one works.
        String second = call(owner, post("/api/users/" + deskId + "/password"), 200).get("password").asText();
        login(byCode(code, "p9555600002@code.test", first)).andExpect(status().isBadRequest());
        Cookie desk = signIn(byCode(code, "p9555600002@code.test", second));

        // Changing your own password needs the current one.
        call(desk, post("/api/users/me/password").content("{\"currentPassword\":\"wrong-one\",\"password\":\"desk-new-pass\"}"), 400);
        call(desk, post("/api/users/me/password").content("{\"currentPassword\":\"" + second + "\",\"password\":\"desk-new-pass\"}"), 204);
        signIn(byCode(code, "p9555600002@code.test", "desk-new-pass"));
        call(desk, post("/api/users/" + deskId + "/password"), 403); // a receptionist resets nobody's

        // Removed from this dharamshala: the code no longer lets them in.
        call(owner, delete("/api/users/" + deskId), 204);
        login(byCode(code, "p9555600002@code.test", "desk-new-pass")).andExpect(status().isBadRequest());
    }

    @Test
    void wrongPasswordsRunOut() throws Exception {
        for (int i = 0; i < 10; i++) login(byCode(otherCode, "p9555600008@code.test", "guess-" + i)).andExpect(status().isBadRequest());
        login(byCode(otherCode, "p9555600008@code.test", "guessed-12")).andExpect(status().isForbidden());
    }
}
