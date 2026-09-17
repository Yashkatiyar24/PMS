package in.pms.tenant;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The guarantees the whole system rests on: tenants cannot see each other, and rooms cannot be double-booked. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TenantIsolationTest {

    @Autowired @Qualifier("jdbc") JdbcClient jdbc;
    @Autowired @Qualifier("adminJdbc") JdbcClient adminJdbc;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    UUID org, propA, propB, roomA, roomB;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = adminJdbc.sql("insert into organisations(name) values ('Test Trust') returning id").query(UUID.class).single();
            propA = adminJdbc.sql("insert into properties(org_id, name) values (?, 'A') returning id").param(org).query(UUID.class).single();
            propB = adminJdbc.sql("insert into properties(org_id, name) values (?, 'B') returning id").param(org).query(UUID.class).single();
            roomA = room(propA);
            roomB = room(propB);
        });
    }

    UUID room(UUID prop) {
        UUID type = adminJdbc.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(prop).query(UUID.class).single();
        return adminJdbc.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(prop, type).query(UUID.class).single();
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("booking_units", "bookings", "guests", "rooms", "room_types"))
                adminJdbc.sql("delete from " + t + " where property_id in (?, ?)").params(propA, propB).update();
            adminJdbc.sql("delete from properties where id in (?, ?)").params(propA, propB).update();
            adminJdbc.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    /** Runs body as property {@code prop} on the RLS-enforced pool. */
    <T> T asTenant(UUID prop, java.util.function.Supplier<T> body) {
        return TenantContext.runAs(prop, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    UUID book(UUID prop, UUID room, String arrive, String depart) {
        UUID guest = jdbc.sql("insert into guests(property_id, name) values (?, 'G') returning id").param(prop).query(UUID.class).single();
        UUID booking = jdbc.sql("insert into bookings(property_id, guest_id, state, arrive_at, depart_at) values (?, ?, 'checked_in', ?, ?) returning id")
                .params(prop, guest, OffsetDateTime.parse(arrive), OffsetDateTime.parse(depart)).query(UUID.class).single();
        jdbc.sql("insert into booking_units(property_id, booking_id, room_id, rate_paise, arrive_at, depart_at) values (?, ?, ?, 100000, ?, ?)")
                .params(prop, booking, room, OffsetDateTime.parse(arrive), OffsetDateTime.parse(depart)).update();
        return booking;
    }

    @Test
    void tenantSeesOnlyItsOwnRows() {
        List<UUID> seen = asTenant(propA, () -> jdbc.sql("select id from rooms").query(UUID.class).list());
        assertThat(seen).contains(roomA).doesNotContain(roomB);
    }

    @Test
    void tenantCannotWriteAnotherTenantsRows() {
        assertThatThrownBy(() -> asTenant(propA, () ->
                jdbc.sql("insert into guests(property_id, name) values (?, 'X')").param(propB).update()))
                .rootCause().hasMessageContaining("row-level security");
    }

    @Test
    void transactionWithoutTenantIsRefused() {
        assertThatThrownBy(() -> new TransactionTemplate(tenantTx).execute(tx -> jdbc.sql("select 1").query(Integer.class).single()))
                .hasMessageContaining("without a tenant");
    }

    @Test
    void overlappingStaysAreRejectedIncludingDayUse() {
        asTenant(propA, () -> book(propA, roomA, "2026-10-01T12:00+05:30", "2026-10-03T10:00+05:30"));
        assertThatThrownBy(() -> asTenant(propA, () -> book(propA, roomA, "2026-10-02T04:00+05:30", "2026-10-02T18:00+05:30")))
                .isInstanceOf(DataIntegrityViolationException.class)
                .rootCause().hasMessageContaining("booking_units_no_overlap");
        // back-to-back on the boundary is allowed: ranges are half-open
        asTenant(propA, () -> book(propA, roomA, "2026-10-03T10:00+05:30", "2026-10-04T10:00+05:30"));
    }

    @Test
    void emptyStayIsRejected() {
        assertThatThrownBy(() -> asTenant(propA, () -> book(propA, roomA, "2026-11-01T10:00+05:30", "2026-11-01T10:00+05:30")))
                .rootCause().hasMessageContaining("positive_stay");
    }

    @Test
    void auditLogIsAppendOnlyForTheAppRole() {
        asTenant(propA, () -> jdbc.sql("insert into audit_log(property_id, table_name, row_id, action) values (?, 't', '1', 'insert')").param(propA).update());
        assertThatThrownBy(() -> asTenant(propA, () -> jdbc.sql("update audit_log set action = 'x' where property_id = ?").param(propA).update()))
                .rootCause().hasMessageContaining("permission denied");
    }
}
