package in.pms.auth;

import in.pms.tenant.TenantContext;
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

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Each role reaches what its job needs and nothing else, enforced by the server, not by hiding buttons. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RolesAndPermissionsTest {
    @Autowired MockMvc mvc;
    @Autowired SessionService sessions;
    @Autowired ApprovalService approvals;
    @Autowired PasswordService passwords;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    UUID org, property, room, owner, adminUser, manager, receptionist, housekeeper, accountant;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from property_users where user_id in (select id from users where phone like '97000000%')").update();
            admin.sql("delete from sessions where user_id in (select id from users where phone like '97000000%')").update();
            admin.sql("delete from users where phone like '97000000%'").update();
            org = admin.sql("insert into organisations(name) values ('Roles Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name) values (?, 'Roles Test') returning id").param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, type).query(UUID.class).single();
            owner = member("Owner", "9700000001", "owner", null);
            adminUser = member("Admin", "9700000002", "admin", null);
            manager = member("Manager", "9700000003", "manager", passwords.hash("4321"));
            receptionist = member("Desk", "9700000004", "receptionist", null);
            housekeeper = member("Cleaner", "9700000005", "housekeeping", null);
            accountant = member("Accounts", "9700000006", "accountant", null);
        });
    }

    UUID member(String name, String phone, String role, String pinHash) {
        UUID id = admin.sql("insert into users(name, phone) values (?, ?) returning id").params(name, phone).query(UUID.class).single();
        admin.sql("insert into property_users(property_id, user_id, role, approval_pin_hash) values (?, ?, ?::user_role, ?)").params(property, id, role, pinHash).update();
        return id;
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            admin.sql("delete from sessions where user_id in (select user_id from property_users where property_id = ?)").param(property).update();
            List<UUID> users = admin.sql("select user_id from property_users where property_id = ?").param(property).query(UUID.class).list();
            admin.sql("delete from property_users where property_id = ?").param(property).update();
            for (UUID u : users) admin.sql("delete from users where id = ?").param(u).update();
            admin.sql("delete from rooms where property_id = ?").param(property).update();
            admin.sql("delete from room_types where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    Cookie as(UUID user) { return new Cookie("pms_session", sessions.create(user, "test").token()); }

    @Test
    void meReportsTheRoleItsRankAndItsPermissions() throws Exception {
        mvc.perform(get("/api/auth/me").cookie(as(accountant))).andExpect(status().isOk())
                .andExpect(jsonPath("$.position", is("accountant")))
                .andExpect(jsonPath("$.role", is("LIMITED")))
                .andExpect(jsonPath("$.permissions", hasItems("revenue.view", "expenses")))
                .andExpect(jsonPath("$.permissions", not(hasItem("checkin"))));
        mvc.perform(get("/api/auth/me").cookie(as(receptionist))).andExpect(jsonPath("$.role", is("STAFF")));
        mvc.perform(get("/api/auth/me").cookie(as(adminUser))).andExpect(jsonPath("$.role", is("MANAGER")));
    }

    @Test
    void housekeepingCleansRoomsButCannotSeeGuestsOrMoney() throws Exception {
        Cookie c = as(housekeeper);
        mvc.perform(get("/api/rooms").cookie(c)).andExpect(status().isOk());
        mvc.perform(patch("/api/rooms/" + room + "/status").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"clean\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/bookings/today").cookie(c)).andExpect(status().isForbidden());
        mvc.perform(get("/api/guests?q=a").cookie(c)).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/daily").cookie(c)).andExpect(status().isForbidden());
        // Any member can read the settings the screens need.
        mvc.perform(get("/api/settings").cookie(c)).andExpect(status().isOk());
    }

    @Test
    void anAccountantReadsRevenueButCannotRunTheDesk() throws Exception {
        Cookie c = as(accountant);
        mvc.perform(get("/api/reports/daily").cookie(c)).andExpect(status().isOk());
        mvc.perform(get("/api/bookings/today").cookie(c)).andExpect(status().isOk());
        mvc.perform(post("/api/bookings/check-in").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/rooms/" + room + "/status").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"dirty\"}")).andExpect(status().isForbidden());
    }

    @Test
    void theDeskStillCannotSeeTheMoneyReports() throws Exception {
        mvc.perform(get("/api/reports/daily").cookie(as(receptionist))).andExpect(status().isForbidden());
        mvc.perform(get("/api/bookings/today").cookie(as(receptionist))).andExpect(status().isOk());
    }

    @Test
    void aReceptionistNeedsAPinForARefundAndThePinSaysWhoApproved() {
        var desk = new CurrentUser(receptionist, "Desk", false, null, property, CurrentUser.Role.STAFF, List.of(), "receptionist", Permissions.of("receptionist"));
        TenantContext.runAs(property, () -> {
            assertThatThrownBy(() -> approvals.require(desk, Permissions.REFUND, null, null)).hasMessageContaining("approval");
            assertThatThrownBy(() -> approvals.require(desk, Permissions.REFUND, desk.id(), "0000")).hasMessageContaining("Wrong approval PIN");
            // The desk sends its own id with the manager's PIN; the PIN identifies the manager.
            assertThat(approvals.require(desk, Permissions.REFUND, desk.id(), "4321")).isEqualTo(manager);
        });
        var boss = new CurrentUser(manager, "Manager", false, null, property, CurrentUser.Role.MANAGER, List.of(), "manager", Permissions.of("manager"));
        TenantContext.runAs(property, () -> assertThat(approvals.require(boss, Permissions.REFUND, null, null)).isEqualTo(manager));
    }

    @Test
    void anAdminManagesStaffButOnlyAnOwnerGrantsOwnerOrAdmin() throws Exception {
        Cookie c = as(adminUser);
        mvc.perform(post("/api/users").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"New Cleaner\",\"phone\":\"9700000009\",\"role\":\"housekeeping\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.role", is("housekeeping")));
        mvc.perform(post("/api/users").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Usurper\",\"phone\":\"9700000008\",\"role\":\"owner\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/" + owner + "/role").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"staff\"}")).andExpect(status().isForbidden());
        // Nor by inviting the owner's number again with a lesser role.
        mvc.perform(post("/api/users").cookie(c).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Owner\",\"phone\":\"9700000001\",\"role\":\"housekeeping\"}")).andExpect(status().isForbidden());
        // A manager does not manage staff at all.
        mvc.perform(post("/api/users").cookie(as(manager)).header("X-Requested-With", "pms").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"X\",\"phone\":\"9700000007\",\"role\":\"staff\"}")).andExpect(status().isForbidden());
    }

    @Test
    void wrongPinsRunOut() {
        UUID asker = UUID.randomUUID(); // a fresh desk user, so other tests' guesses do not count
        var desk = new CurrentUser(asker, "Guesser", false, null, property, CurrentUser.Role.STAFF, List.of(), "receptionist", Permissions.of("receptionist"));
        TenantContext.runAs(property, () -> {
            for (int i = 0; i < 5; i++) assertThatThrownBy(() -> approvals.require(desk, Permissions.REFUND, null, "0000")).hasMessageContaining("Wrong");
            // Even the right PIN is refused once the guesses are used up.
            assertThatThrownBy(() -> approvals.require(desk, Permissions.REFUND, null, "4321")).hasMessageContaining("Too many");
        });
    }

    @Test
    void theRoleTableHoldsTheOldBehaviour() {
        // Staff and receptionist are the same desk; manager and owner can approve every exception.
        assertThat(Permissions.of("staff")).isEqualTo(Permissions.of("receptionist"));
        assertThat(Permissions.of("staff")).doesNotContain(Permissions.DISCOUNT, Permissions.REFUND, Permissions.RESERVATIONS_CANCEL, Permissions.REVENUE_VIEW);
        assertThat(Permissions.of("manager")).contains(Permissions.DISCOUNT, Permissions.REFUND, Permissions.RESERVATIONS_CANCEL, Permissions.INVOICE_EDIT);
        assertThat(Permissions.rank("housekeeping")).isEqualTo(CurrentUser.Role.LIMITED);
        assertThat(Set.copyOf(Permissions.ROLES)).hasSize(8);
    }
}
