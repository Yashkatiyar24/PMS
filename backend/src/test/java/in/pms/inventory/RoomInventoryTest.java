package in.pms.inventory;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.common.BadRequestException;
import in.pms.config.RoomDefaults;
import in.pms.guests.GuestService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The room inventory: laying a property's floors out, changing the layout later, and the things the inventory
 * must refuse.
 *
 * <p>The rules being pinned down here are the ones that cost real money to get wrong: a plan never renumbers
 * or removes a room that already exists, a room with a guest or a booking in it cannot quietly leave the
 * inventory, and one property's floor plan is invisible to another's.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)   // the layout is grown and changed in sequence, as an owner does
class RoomInventoryTest {
    @Autowired InventoryService inventory;
    @Autowired BookingService bookings;
    @Autowired RoomDefaults defaults;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    UUID org, property, other, type, otherType;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Inventory Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone, settings) values (?, 'Inventory A', 'Asia/Kolkata', '{\"id_photo_required\":false}'::jsonb) returning id")
                    .param(org).query(UUID.class).single();
            other = admin.sql("insert into properties(org_id, name, timezone) values (?, 'Inventory B', 'Asia/Kolkata') returning id").param(org).query(UUID.class).single();
            type = admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy) values (?, 'Standard', 150000, 2) returning id").param(property).query(UUID.class).single();
            otherType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Standard', 100000) returning id").param(other).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("notifications", "receipts", "receipt_counters", "payments", "folio_lines", "folios",
                    "booking_units", "booking_members", "bookings", "guests", "beds", "rooms", "floors", "room_types"))
                admin.sql("delete from " + t + " where property_id in (?, ?)").params(property, other).update();
            admin.sql("delete from properties where id in (?, ?)").params(property, other).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T as(UUID prop, Supplier<T> body) {
        return TenantContext.runAs(prop, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get()));
    }

    private InventoryService.SetupPlan setup(UUID prop, boolean apply, int... roomsPerFloor) {
        var floors = new java.util.ArrayList<InventoryService.FloorSpec>();
        for (int i = 0; i < roomsPerFloor.length; i++) floors.add(new InventoryService.FloorSpec(i + 1, roomsPerFloor[i], null));
        return as(prop, () -> inventory.setup(new InventoryService.SetupInput(floors, type(prop), apply), null));
    }

    private UUID type(UUID prop) { return prop.equals(property) ? type : otherType; }

    private Booking reserve(UUID roomId, int fromDay, int nights) {
        LocalDate today = LocalDate.now(ZONE);
        OffsetDateTime arrive = today.plusDays(fromDay).atTime(14, 0).atZone(ZONE).toOffsetDateTime();
        OffsetDateTime depart = today.plusDays(fromDay + nights).atTime(10, 0).atZone(ZONE).toOffsetDateTime();
        return as(property, () -> bookings.reserve(new BookingService.ReservationRequest(null,
                new GuestService.GuestInput("Inventory Guest", "", "", "", "IN", null, null, null, null, null, ""),
                null, List.of(new BookingService.UnitRequest(roomId, null, null)), arrive, depart, 1, 0, null, null, true, false, null, null, null), null));
    }

    private Room room(UUID prop, String number) {
        return as(prop, () -> inventory.rooms()).stream().filter(r -> r.number().equals(number)).findFirst().orElseThrow();
    }

    // ---------- Laying the building out ----------

    /** The default plan is whatever the configuration says, and it adds up to the count a new property starts with. */
    @Test
    @Order(1)
    void theDefaultPlanIsTheConfiguredOne() {
        assertThat(defaults.defaultRoomCount()).isEqualTo(defaults.roomsPerFloor().stream().mapToInt(Integer::intValue).sum());
        assertThat(defaults.number(1, 1)).isEqualTo("101");
        assertThat(defaults.number(3, 5)).isEqualTo("305");
        assertThat(defaults.number(2, 10)).isEqualTo("210");
    }

    /** A preview says exactly what the real thing will do, because it is the same call with apply off. */
    @Test
    @Order(2)
    void thePreviewCreatesNothingAndMatchesWhatFollows() {
        var preview = setup(property, false, 10, 10, 5);
        assertThat(preview.total()).isEqualTo(25);
        assertThat(preview.created()).isEqualTo(25);
        assertThat(as(property, () -> inventory.rooms())).isEmpty();
        assertThat(preview.floors().getFirst().create()).startsWith("101", "102").endsWith("110");
        assertThat(preview.floors().getLast().create()).containsExactly("301", "302", "303", "304", "305");

        var applied = setup(property, true, 10, 10, 5);
        assertThat(applied.created()).isEqualTo(preview.created());
        var rooms = as(property, () -> inventory.rooms());
        assertThat(rooms).hasSize(25);
        assertThat(rooms.stream().map(Room::number)).contains("101", "110", "201", "210", "301", "305");
        // Every floor of the plan has a row to be named through.
        assertThat(as(property, () -> inventory.floors())).hasSize(3).allSatisfy(f -> assertThat(f.rooms()).isGreaterThan(0));
    }

    /** Twenty-five to forty: the fifteen new rooms appear and not one of the first twenty-five moves. */
    @Test
    @Order(3)
    void growingTheInventoryKeepsEveryRoomItAlreadyHad() {
        var before = as(property, () -> inventory.rooms()).stream().map(Room::number).sorted().toList();

        var plan = setup(property, true, 10, 10, 10, 10);
        assertThat(plan.created()).isEqualTo(15);          // floor 3 filled to ten, and a whole fourth floor
        assertThat(plan.kept()).isEqualTo(25);
        assertThat(plan.total()).isEqualTo(40);

        var after = as(property, () -> inventory.rooms()).stream().map(Room::number).sorted().toList();
        assertThat(after).hasSize(40).containsAll(before).contains("306", "310", "401", "410");
    }

    /** Forty back to twenty: nothing is deleted. The rooms beyond the plan are reported for a human to decide. */
    @Test
    @Order(4)
    void shrinkingTheInventoryDeletesNothingAndSaysWhatIsSpare() {
        var plan = setup(property, true, 10, 10, 0, 0);
        assertThat(plan.total()).isEqualTo(20);
        assertThat(plan.created()).isZero();
        assertThat(plan.surplus()).isEqualTo(20);          // the two upper floors, untouched
        assertThat(plan.floors().get(2).surplus()).contains("301", "310");
        assertThat(as(property, () -> inventory.rooms())).as("every room is still there").hasSize(40);
    }

    /** A second plan over the same floors creates nothing: the numbers are already taken. */
    @Test
    @Order(5)
    void runningTheSamePlanTwiceCreatesNoDuplicates() {
        var again = setup(property, true, 10, 10, 10, 10);
        assertThat(again.created()).isZero();
        assertThat(as(property, () -> inventory.rooms())).hasSize(40);
    }

    // ---------- Floors and single rooms ----------

    @Test
    @Order(6)
    void aFloorCanBeNamedAddedAndForgottenButNotWhileItHasRooms() {
        as(property, () -> inventory.saveFloor(new InventoryService.FloorInput(1, "Ground wing", 1), null));
        assertThat(as(property, () -> inventory.floors())).filteredOn(f -> f.number() == 1).singleElement()
                .satisfies(f -> assertThat(f.name()).isEqualTo("Ground wing"));

        // A floor added before its rooms shows up, and can be dropped again because nothing is on it.
        as(property, () -> inventory.saveFloor(new InventoryService.FloorInput(9, "Terrace", 9), null));
        assertThat(as(property, () -> inventory.floors())).anySatisfy(f -> assertThat(f.number()).isEqualTo(9));
        as(property, () -> { inventory.deleteFloor(9, null); return null; });
        assertThat(as(property, () -> inventory.floors())).noneSatisfy(f -> assertThat(f.number()).isEqualTo(9));

        assertThatThrownBy(() -> as(property, () -> { inventory.deleteFloor(1, null); return null; }))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("still has");
    }

    @Test
    @Order(7)
    void oneMoreRoomIsOfferedTheNextFreeNumberOnItsFloor() {
        assertThat(as(property, () -> inventory.nextNumber(4))).isEqualTo("411");
        Room added = as(property, () -> inventory.createRoom(new InventoryService.RoomInput(type, "411", 4, true, null), null));
        assertThat(added.number()).isEqualTo("411");
        assertThat(as(property, () -> inventory.nextNumber(4))).isEqualTo("412");
    }

    @Test
    @Order(8)
    void aRoomKeepsWhatTheOwnerTypedIntoIt() {
        Room r = room(property, "101");
        Room saved = as(property, () -> inventory.updateRoom(r.id(),
                new InventoryService.RoomInput(type, "A101", 1, true, "Annexe", "Corner suite", "double", "Faces the river"), null));
        assertThat(saved.number()).isEqualTo("A101");
        assertThat(saved.name()).isEqualTo("Corner suite");
        assertThat(saved.bedType()).isEqualTo("double");
        assertThat(saved.description()).isEqualTo("Faces the river");
        assertThat(saved.building()).isEqualTo("Annexe");
        // ...and reading it back from the list, not just from the write's own answer.
        assertThat(room(property, "A101").name()).isEqualTo("Corner suite");
    }

    @Test
    @Order(9)
    void twoRoomsCannotShareANumber() {
        assertThatThrownBy(() -> as(property, () -> inventory.createRoom(new InventoryService.RoomInput(type, "102", 1, true, null), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("already exists");
        // A room renamed onto another's number is refused in the same words.
        Room r = room(property, "103");
        assertThatThrownBy(() -> as(property, () -> inventory.updateRoom(r.id(), new InventoryService.RoomInput(type, "102", 1, true, null), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("already exists");
    }

    @Test
    @Order(10)
    void aRoomNeedsANumberAndARealFloor() {
        assertThatThrownBy(() -> as(property, () -> inventory.createRoom(new InventoryService.RoomInput(type, "  ", 1, true, null), null)))
                .hasMessageContaining("required");
        assertThatThrownBy(() -> as(property, () -> inventory.createRoom(new InventoryService.RoomInput(type, "X1", -1, true, null), null)))
                .hasMessageContaining("Floor");
        assertThatThrownBy(() -> as(property, () -> inventory.setup(new InventoryService.SetupInput(
                List.of(new InventoryService.FloorSpec(1, 10, null), new InventoryService.FloorSpec(1, 5, null)), type, false), null)))
                .hasMessageContaining("twice");
    }

    // ---------- Bulk, and what the bookings refuse ----------

    @Test
    @Order(11)
    void aBlockOfRoomsChangesTogether() {
        var ids = as(property, () -> inventory.rooms()).stream().filter(r -> r.floor() == 2).limit(5).map(Room::id).toList();
        UUID deluxe = as(property, () -> inventory.createRoomType(
                new InventoryService.RoomTypeInput("Deluxe", 250000, 3, 50000, false, 0, 1, true, List.of("AC", "WiFi")), null)).id();

        var changed = as(property, () -> inventory.bulkUpdate(new InventoryService.BulkUpdateInput(ids, deluxe, null, null), null));
        assertThat(changed).hasSize(5).allSatisfy(r -> assertThat(r.roomTypeName()).isEqualTo("Deluxe"));
        // The rate follows the type, which is where a rate lives.
        assertThat(as(property, () -> inventory.roomTypes())).filteredOn(ty -> ty.name().equals("Deluxe")).singleElement()
                .satisfies(ty -> assertThat(ty.baseRatePaise()).isEqualTo(250000));

        assertThatThrownBy(() -> as(property, () -> inventory.bulkUpdate(new InventoryService.BulkUpdateInput(ids, null, null, null), null)))
                .hasMessageContaining("Nothing to change");
    }

    /**
     * The guard that matters: a room somebody is booked into cannot be taken out of the inventory, one at a
     * time or in a block, and no amount of asking deletes it.
     */
    @Test
    @Order(12)
    void aBookedRoomCannotLeaveTheInventory() {
        Room r = room(property, "104");
        reserve(r.id(), 7, 2);

        assertThatThrownBy(() -> as(property, () -> inventory.updateRoom(r.id(), new InventoryService.RoomInput(type, "104", 1, false, null), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("future booking");
        assertThatThrownBy(() -> as(property, () -> inventory.bulkUpdate(new InventoryService.BulkUpdateInput(List.of(r.id()), null, null, false), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("future booking");
        assertThat(room(property, "104").active()).isTrue();

        // A room with no bookings goes out of use, and comes back: that is as far as removal goes.
        Room spare = room(property, "110");
        assertThat(as(property, () -> inventory.updateRoom(spare.id(), new InventoryService.RoomInput(type, "110", 1, false, null), null)).active()).isFalse();
        assertThat(as(property, () -> inventory.updateRoom(spare.id(), new InventoryService.RoomInput(type, "110", 1, true, null), null)).active()).isTrue();
    }

    /** What the bookings say about a room is what the rooms screen shows; nothing is stored twice. */
    @Test
    @Order(13)
    void aBookingShowsUpOnTheRoomItself() {
        Room r = room(property, "105");
        reserve(r.id(), 0, 1);
        var after = room(property, "105");
        assertThat(after.occupancy()).isNotNull();
        assertThat(after.occupancy().state()).isEqualTo("reserved");
        assertThat(after.occupancy().guestName()).isEqualTo("Inventory Guest");
    }

    // ---------- Two properties ----------

    /**
     * Property A's floor plan and property B's are the same numbers in the same database, and neither can see
     * the other. Row Level Security answers this, not the code — which is why the assertion is on what a
     * property's own queries return rather than on a filter somewhere.
     */
    @Test
    @Order(14)
    void twoPropertiesWithTheSameRoomNumbersStayApart() {
        setup(other, true, 10, 10, 5);
        assertThat(as(other, () -> inventory.rooms())).hasSize(25);
        assertThat(as(other, () -> inventory.rooms()).stream().map(Room::number)).contains("101", "305");

        // A's "101" was renamed to A101 earlier and A has forty-plus rooms; B is untouched by any of it.
        assertThat(as(other, () -> inventory.rooms()).stream().map(Room::number)).doesNotContain("A101", "411");
        assertThat(as(property, () -> inventory.rooms())).hasSizeGreaterThan(25);
        assertThat(as(other, () -> inventory.floors())).hasSize(3);

        // Neither can reach the other's rooms or give a room the other's room type.
        UUID bRoom = as(other, () -> inventory.rooms()).getFirst().id();
        assertThatThrownBy(() -> as(property, () -> inventory.room(bRoom))).hasMessageContaining("Room");
        Room aRoom = room(property, "102");
        assertThatThrownBy(() -> as(property, () -> inventory.updateRoom(aRoom.id(), new InventoryService.RoomInput(otherType, "102", 1, true, null), null)))
                .hasMessageContaining("Room type");
    }
}
