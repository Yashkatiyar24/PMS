package in.pms.inventory;

import in.pms.config.RoomDefaults;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Furnishing a property that has nothing — the properties made before onboarding laid a floor plan, whose
 * owners were looking at an empty rooms screen.
 *
 * <p>The promise is one-directional: a property with no rooms gets the default plan, and a property with any
 * rooms at all is left exactly as it is. That is what makes it safe for this to run on every start-up.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DefaultInventoryTest {
    @Autowired DefaultInventory seeder;
    @Autowired RoomDefaults defaults;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;

    UUID org, empty, furnished, withType;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Backfill Trust') returning id").query(UUID.class).single();
            empty = admin.sql("insert into properties(org_id, name) values (?, 'Never Set Up') returning id").param(org).query(UUID.class).single();
            furnished = admin.sql("insert into properties(org_id, name) values (?, 'Already Furnished') returning id").param(org).query(UUID.class).single();
            withType = admin.sql("insert into properties(org_id, name) values (?, 'Has A Type Only') returning id").param(org).query(UUID.class).single();

            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Cottage', 500000) returning id")
                    .param(furnished).query(UUID.class).single();
            admin.sql("insert into rooms(property_id, room_type_id, number, floor) values (?, ?, 'C1', 1)").params(furnished, type).update();
            admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Deluxe', 300000, 4)").param(withType).update();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (UUID p : List.of(empty, furnished, withType))
                for (String t : List.of("rooms", "floors", "room_types")) admin.sql("delete from " + t + " where property_id = ?").param(p).update();
            admin.sql("delete from properties where id in (?, ?, ?)").params(empty, furnished, withType).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    private int rooms(UUID property) {
        return admin.sql("select count(*) from rooms where property_id = ?").param(property).query(Integer.class).single();
    }

    @Test
    void aPropertyWithNoRoomsGetsTheDefaultPlan() {
        int created = new TransactionTemplate(adminTx).execute(tx -> seeder.seed(empty));
        assertThat(created).isEqualTo(defaults.defaultRoomCount());
        assertThat(rooms(empty)).isEqualTo(defaults.defaultRoomCount());

        var numbers = admin.sql("select number from rooms where property_id = ? order by number").param(empty).query(String.class).list();
        assertThat(numbers).contains("101", "110", "201", "210", "301", "305");
        assertThat(admin.sql("select count(*) from floors where property_id = ?").param(empty).query(Integer.class).single())
                .isEqualTo(defaults.roomsPerFloor().size());
    }

    @Test
    void runningItAgainChangesNothing() {
        new TransactionTemplate(adminTx).execute(tx -> seeder.seed(empty));
        int after = new TransactionTemplate(adminTx).execute(tx -> seeder.seed(empty));
        assertThat(after).isZero();
        assertThat(rooms(empty)).isEqualTo(defaults.defaultRoomCount());
    }

    /** The one that matters on a live database: a property with rooms keeps exactly what it has. */
    @Test
    void aPropertyThatAlreadyHasRoomsIsLeftAlone() {
        int created = new TransactionTemplate(adminTx).execute(tx -> seeder.seed(furnished));
        assertThat(created).isZero();
        assertThat(admin.sql("select number from rooms where property_id = ?").param(furnished).query(String.class).list())
                .containsExactly("C1");
    }

    /** A property part-way through setting up keeps its own room type instead of collecting a second one. */
    @Test
    void aRoomTypeTheOwnerAlreadyMadeIsTheOneUsed() {
        new TransactionTemplate(adminTx).execute(tx -> seeder.seed(withType));
        assertThat(admin.sql("select count(*) from room_types where property_id = ?").param(withType).query(Integer.class).single()).isEqualTo(1);
        assertThat(admin.sql("""
                select distinct t.name from rooms r join room_types t on t.id = r.room_type_id where r.property_id = ?""")
                .param(withType).query(String.class).list()).containsExactly("Deluxe");
    }
}
