package in.pms.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Login, cookie, CSRF header, property switch and revocation, end to end over HTTP. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "pms.auth.dev-otp=424242")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuthFlowTest {
    @Autowired MockMvc mvc;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired PasswordService passwords;

    UUID org, propA, propB, user;
    final String phone = "9111111111", email = "authflow@test.local";

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Auth Trust') returning id").query(UUID.class).single();
            propA = admin.sql("insert into properties(org_id, name) values (?, 'Auth A') returning id").param(org).query(UUID.class).single();
            propB = admin.sql("insert into properties(org_id, name) values (?, 'Auth B') returning id").param(org).query(UUID.class).single();
            user = admin.sql("insert into users(name, phone, email, password_hash) values ('Auth User', ?, ?, ?) returning id")
                    .params(phone, email, passwords.hash("secret-pass")).query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'manager'), (?, ?, 'staff')").params(propA, user, propB, user).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from sessions where user_id = ?").param(user).update();
            admin.sql("delete from otp_codes where target in (?, ?)").params(phone, email).update();
            admin.sql("delete from property_users where user_id = ?").param(user).update();
            admin.sql("delete from users where id = ?").param(user).update();
            admin.sql("delete from properties where id in (?, ?)").params(propA, propB).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    Cookie loginByPassword() throws Exception {
        var res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"secret-pass\",\"deviceName\":\"test\"}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        String setCookie = res.getHeader("Set-Cookie");
        String token = setCookie.substring("pms_session=".length(), setCookie.indexOf(';'));
        return new Cookie("pms_session", token);
    }

    @Test
    void unauthenticatedRequestsGet401() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void wrongPasswordIsRejectedWithoutRevealingWhetherTheUserExists() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\",\"password\":\"nope\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", is("Wrong email or password")));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@test.local\",\"password\":\"nope\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", is("Wrong email or password")));
    }

    @Test
    void passwordLoginSetsCookieAndMeShowsMemberships() throws Exception {
        Cookie c = loginByPassword();
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("Auth User")))
                .andExpect(jsonPath("$.memberships", hasSize(2)))
                .andExpect(jsonPath("$.propertyId").doesNotExist()); // two memberships: nothing selected yet
    }

    @Test
    void mutatingRequestsNeedTheRequestedWithHeader() throws Exception {
        Cookie c = loginByPassword();
        mvc.perform(post("/api/auth/switch-property").cookie(c).contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + propA + "\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/switch-property").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + propA + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(jsonPath("$.propertyId", is(propA.toString()))).andExpect(jsonPath("$.role", is("MANAGER")));
    }

    @Test
    void cannotSwitchToAPropertyYouAreNotAMemberOf() throws Exception {
        Cookie c = loginByPassword();
        mvc.perform(post("/api/auth/switch-property").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void otpLoginByPhoneWorksAndWrongCodeCountsAnAttempt() throws Exception {
        mvc.perform(post("/api/auth/otp/send").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + phone + "\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/auth/otp/verify").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + phone + "\",\"code\":\"000000\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", is("Wrong or expired code")));
        mvc.perform(post("/api/auth/otp/verify").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"+91 " + phone + "\",\"code\":\"424242\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Set-Cookie", containsString("pms_session=")));
    }

    /**
     * Being refused must never look like being signed out. The app sends anyone who gets a 401 back to the
     * login screen, so a staff member tapping a manager-only action would be logged out instead of simply
     * told no. This caught a real defect: the container's forward to /error was re-secured as anonymous and
     * turned a correct 403 into a 401.
     */
    @Test
    void aRefusedRequestIsForbiddenAndLeavesTheSessionIntact() throws Exception {
        Cookie cookie = loginByPassword();
        mvc.perform(post("/api/auth/switch-property").cookie(cookie).header("X-Requested-With", "pms")
                .contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + propB + "\"}"))
                .andExpect(status().isNoContent()); // staff in property B

        mvc.perform(get("/api/reports/daily").cookie(cookie)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/properties").cookie(cookie)).andExpect(status().isForbidden());
        // ...and the session is still usable afterwards.
        mvc.perform(get("/api/auth/me").cookie(cookie)).andExpect(status().isOk());
    }

    /**
     * The desk app is served from another origin and sends the session cookie, so the browser will not let
     * it call the API at all without these headers. Nothing below the browser can catch this: every
     * server-to-server test passes while the real app is unable to sign in.
     */
    @Test
    void theDeskAppsOriginMayCallTheApiWithItsCookie() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-requested-with"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));

        mvc.perform(get("/api/auth/me").cookie(loginByPassword()).header("Origin", "http://localhost:3000"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
    }

    @Test
    void anUnknownOriginIsRefused() throws Exception {
        mvc.perform(options("/api/auth/login")
                        .header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    /** A password someone else chose opens only the door to replace it. */
    @Test
    void aHandedPasswordMustBeReplacedBeforeAnythingElse() throws Exception {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> admin.sql("update users set must_change_password = true where id = ?").param(user).update());
        try {
            Cookie c = loginByPassword();
            mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword", is(true)));
            mvc.perform(post("/api/auth/switch-property").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"propertyId\":\"" + propA + "\"}")).andExpect(status().isNoContent());
            mvc.perform(get("/api/rooms").cookie(c)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code", is("password_change_required")));
            mvc.perform(post("/api/users/me/password").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"currentPassword\":\"secret-pass\",\"password\":\"a-much-better-one-9\"}")).andExpect(status().is2xxSuccessful());
            mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword", is(false)));
            mvc.perform(get("/api/rooms").cookie(c)).andExpect(status().isOk());
        } finally {
            new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                    admin.sql("update users set must_change_password = false, password_hash = ? where id = ?").params(passwords.hash("secret-pass"), user).update());
        }
    }

    /** The code endpoints answer a stranger's number exactly as they answer a registered one. */
    @Test
    void otpAnswersDoNotRevealWhetherANumberIsRegistered() throws Exception {
        String stranger = "9333333333";
        try {
            mvc.perform(post("/api/auth/otp/send").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + stranger + "\"}")).andExpect(status().isOk());
            String unknown = mvc.perform(post("/api/auth/otp/verify").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + stranger + "\",\"code\":\"000000\"}"))
                    .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
            mvc.perform(post("/api/auth/otp/send").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + phone + "\"}")).andExpect(status().isOk());
            String known = mvc.perform(post("/api/auth/otp/verify").contentType(MediaType.APPLICATION_JSON).content("{\"target\":\"" + phone + "\",\"code\":\"000000\"}"))
                    .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
            assertThat(unknown).isEqualTo(known);
        } finally {
            new TransactionTemplate(adminTx).executeWithoutResult(tx -> admin.sql("delete from otp_codes where target = ?").param(stranger).update());
        }
    }

    /** However long a session was valid for, two weeks without use ends it: a lost phone stops working. */
    @Test
    void aSessionIdleForTwoWeeksIsOver() throws Exception {
        Cookie c = loginByPassword();
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk());
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update sessions set last_seen_at = now() - interval '15 days' where user_id = ? and revoked_at is null").param(user).update());
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesTheSession() throws Exception {
        Cookie c = loginByPassword();
        mvc.perform(post("/api/auth/logout").cookie(c).header("X-Requested-With", "pms")).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isUnauthorized());
    }
}
