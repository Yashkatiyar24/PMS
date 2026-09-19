package in.pms.portfolio;

import in.pms.auth.SessionService;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A trust with several properties: its owner sees each one's day side by side, and nothing of a property they
 * do not belong to. The audit trail is read one property at a time, by those allowed to read it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PortfolioAndAuditTest {
    @Autowired MockMvc mvc;
    @Autowired SessionService sessions;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    UUID org, hotelA, hotelB, dharamshalaC, stranger, owner, desk;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from property_users where user_id in (select id from users where phone in ('9711100001', '9711100002'))").update();
            admin.sql("delete from sessions where user_id in (select id from users where phone in ('9711100001', '9711100002'))").update();
            admin.sql("delete from users where phone in ('9711100001', '9711100002')").update();
            org = admin.sql("insert into organisations(name) values ('Portfolio Trust') returning id").query(UUID.class).single();
            hotelA = admin.sql("insert into properties(org_id, name) values (?, 'Hotel A') returning id").param(org).query(UUID.class).single();
            hotelB = admin.sql("insert into properties(org_id, name) values (?, 'Hotel B') returning id").param(org).query(UUID.class).single();
            dharamshalaC = admin.sql("insert into properties(org_id, name) values (?, 'Dharamshala C') returning id").param(org).query(UUID.class).single();
            stranger = admin.sql("insert into properties(org_id, name) values (?, 'Not Theirs') returning id").param(org).query(UUID.class).single();
            owner = admin.sql("insert into users(name, phone) values ('Trustee', '9711100001') returning id").query(UUID.class).single();
            desk = admin.sql("insert into users(name, phone) values ('Desk', '9711100002') returning id").query(UUID.class).single();
            admin.sql("insert into property_users(property_id, user_id, role) values (?, ?, 'owner'), (?, ?, 'owner'), (?, ?, 'owner'), (?, ?, 'receptionist')")
                    .params(hotelA, owner, hotelB, owner, dharamshalaC, owner, hotelA, desk).update();
            admin.sql("insert into audit_log(property_id, user_id, table_name, row_id, action, after) values (?, ?, 'rooms', 'r1', 'status', '{\"status\":\"clean\"}'::jsonb)").params(hotelA, owner).update();
            admin.sql("insert into audit_log(property_id, user_id, table_name, row_id, action) values (?, ?, 'rooms', 'r2', 'status')").params(stranger, owner).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from sessions where user_id in (?, ?)").params(owner, desk).update();
            admin.sql("delete from property_users where user_id in (?, ?)").params(owner, desk).update();
            admin.sql("delete from users where id in (?, ?)").params(owner, desk).update();
            for (UUID p : List.of(hotelA, hotelB, dharamshalaC, stranger)) admin.sql("delete from properties where id = ?").param(p).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    Cookie login(UUID user, UUID property) throws Exception {
        Cookie c = new Cookie("pms_session", sessions.create(user, "test").token());
        mvc.perform(post("/api/auth/switch-property").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"propertyId\":\"" + property + "\"}")).andExpect(status().isNoContent());
        return c;
    }

    @Test
    void theOwnerSeesTheirPropertiesAndOnlyThose() throws Exception {
        Cookie c = login(owner, hotelA);
        mvc.perform(get("/api/portfolio").cookie(c)).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[*].propertyName", containsInAnyOrder("Hotel A", "Hotel B", "Dharamshala C")))
                .andExpect(jsonPath("$[?(@.propertyName == 'Hotel A')].current", contains(true)));
        // A receptionist sees no money anywhere, so no portfolio.
        mvc.perform(get("/api/portfolio").cookie(login(desk, hotelA))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        // And nobody can switch into a property they do not belong to.
        mvc.perform(post("/api/auth/switch-property").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"propertyId\":\"" + stranger + "\"}")).andExpect(status().isForbidden());
    }

    @Test
    void theAuditTrailIsReadForOnePropertyByThoseAllowedTo() throws Exception {
        LocalDate day = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")); // the property's calendar, not the server's
        String today = day.toString(), yesterday = day.minusDays(1).toString();
        mvc.perform(get("/api/audit?from=" + yesterday + "&to=" + today + "&table=rooms").cookie(login(owner, hotelA))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].rowId", hasItem("r1")))
                .andExpect(jsonPath("$[*].rowId", not(hasItem("r2"))));
        mvc.perform(get("/api/audit?from=" + yesterday + "&to=" + today + "&q=clean").cookie(login(owner, hotelA))).andExpect(jsonPath("$[*].rowId", hasItem("r1")));
        mvc.perform(get("/api/audit?from=" + yesterday + "&to=" + today).cookie(login(desk, hotelA))).andExpect(status().isForbidden());
    }
}
