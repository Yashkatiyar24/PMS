package in.pms.inventory;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.common.ConflictException;
import in.pms.guests.GuestService;
import in.pms.settings.SettingDef;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
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
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The housekeeping cycle, who is in which bed, and the double bookings the database must refuse. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RoomsAndHousekeepingTest {
    @Autowired BookingService bookings;
    @Autowired InventoryService inventory;
    @Autowired SettingsService settings;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    UUID org, property, other, stdType, dormType, room101, room102, dorm, otherRoom;
    List<UUID> beds;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Rooms Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone, settings) values (?, 'Rooms Test', 'Asia/Kolkata', '{\"id_photo_required\":false}'::jsonb) returning id").param(org).query(UUID.class).single();
            other = admin.sql("insert into properties(org_id, name) values (?, 'Somebody Else') returning id").param(org).query(UUID.class).single();
            stdType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            dormType = admin.sql("insert into room_types(property_id, name, base_rate_paise, is_dormitory, bed_count) values (?, 'Dorm', 20000, true, 3) returning id").param(property).query(UUID.class).single();
            room101 = room(property, stdType, "101");
            room102 = room(property, stdType, "102");
            dorm = room(property, dormType, "D1");
            beds = List.of(bed("D1-1"), bed("D1-2"), bed("D1-3"));
            UUID otherType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(other).query(UUID.class).single();
            otherRoom = room(other, otherType, "101");
        });
    }

    UUID room(UUID prop, UUID type, String number) {
        return admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, ?) returning id").params(prop, type, number).query(UUID.class).single();
    }

    UUID bed(String label) {
        return admin.sql("insert into beds(property_id, room_id, label) values (?, ?, ?) returning id").params(property, dorm, label).query(UUID.class).single();
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("notifications", "receipts", "receipt_counters", "payments", "folio_lines", "folios", "booking_units", "booking_members", "bookings", "guests", "beds", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id in (?, ?)").params(property, other).update();
            admin.sql("delete from properties where id in (?, ?)").params(property, other).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    Booking reserve(UUID roomId, UUID bedId, int fromDay, int nights) {
        LocalDate today = LocalDate.now(ZONE);
        OffsetDateTime arrive = today.plusDays(fromDay).atTime(14, 0).atZone(ZONE).toOffsetDateTime();
        OffsetDateTime depart = today.plusDays(fromDay + nights).atTime(10, 0).atZone(ZONE).toOffsetDateTime();
        return desk(() -> bookings.reserve(new BookingService.ReservationRequest(null, new GuestService.GuestInput("Guest", "", "", "", "IN", null, null, null, null, null, ""),
                null, List.of(new BookingService.UnitRequest(roomId, bedId, null)), arrive, depart, 1, 0, null, null, true, false, null, null, null), null));
    }

    Booking walkIn(UUID roomId, UUID bedId) {
        return desk(() -> bookings.checkIn(new BookingService.CheckInRequest(null, new GuestService.GuestInput("Walk In", "", "", "", "IN", null, null, null, null, null, ""),
                List.of(new BookingService.UnitRequest(roomId, bedId, null)), 1, null, 1, 0, null, null, "", true, false, null, null, null, null, null), null));
    }

    @Test
    void aWholeDormitoryAndOneOfItsBedsCannotBothBeSold() {
        desk(() -> settings.update(Map.of("dorm_whole_room_allowed", true), SettingDef.Role.OWNER, null));
        reserve(dorm, beds.get(0), 30, 2);
        assertThatThrownBy(() -> reserve(dorm, null, 31, 1)).isInstanceOf(ConflictException.class).hasMessageContaining("already taken");
        // ...and the other way round: the whole room first, then a bed in it.
        reserve(dorm, null, 40, 1);
        assertThatThrownBy(() -> reserve(dorm, beds.get(2), 40, 1)).isInstanceOf(ConflictException.class).hasMessageContaining("already taken");
        // Different nights do not clash.
        reserve(dorm, beds.get(2), 41, 1);
        desk(() -> settings.update(Map.of("dorm_whole_room_allowed", false), SettingDef.Role.OWNER, null));
    }

    @Test
    void aStayCannotBeMovedIntoAnotherPropertysRoomOrAMismatchedBed() {
        Booking b = reserve(room102, null, 50, 1);
        UUID unit = b.units().getFirst().id();
        assertThatThrownBy(() -> desk(() -> bookings.changeUnit(b.id(), unit, new BookingService.UnitRequest(otherRoom, null, 100L), null)))
                .hasMessageContaining("Room");
        // A bed of D1 claimed through room 101: the database refuses the pairing even if the code let it through.
        assertThatThrownBy(() -> desk(() -> bookings.changeUnit(b.id(), unit, new BookingService.UnitRequest(room101, beds.get(1), null), null)))
                .hasMessageContaining("beds");
    }

    @Test
    void aRoomCannotSwitchBetweenDormitoryAndOrdinary() {
        // Its beds and their bookings would no longer fit it, and the double-booking guard would stop seeing them.
        assertThatThrownBy(() -> desk(() -> inventory.updateRoom(dorm, new InventoryService.RoomInput(stdType, "D1", 0, true, null), null)))
                .hasMessageContaining("dormitory");
    }

    @Test
    void occupancyFollowsTheBookingsBedByBed() {
        Booking in = walkIn(dorm, beds.get(1));
        Room d = desk(() -> inventory.room(dorm));
        assertThat(d.beds()).filteredOn(bd -> bd.id().equals(beds.get(1))).singleElement()
                .satisfies(bd -> assertThat(bd.occupancy().state()).isEqualTo("occupied"));
        assertThat(d.beds()).filteredOn(bd -> bd.id().equals(beds.get(2))).singleElement()
                .satisfies(bd -> assertThat(bd.occupancy()).isNull());
        assertThat(d.occupancy()).as("the room as a whole is not taken").isNull();
        assertThat(in.state()).isEqualTo("checked_in");
    }

    @Test
    void theCleaningCycleAndARoomUnderMaintenance() {
        desk(() -> inventory.setStatus(room101, "maintenance", "Leaking tap", null, null));
        assertThatThrownBy(() -> walkIn(room101, null)).isInstanceOf(ConflictException.class).hasMessageContaining("maintenance");
        assertThatThrownBy(() -> desk(() -> inventory.setStatus(room101, "maintenance", " ", null, null))).hasMessageContaining("reason");

        desk(() -> inventory.setStatus(room101, "inspected", null, null, null));
        Booking stay = walkIn(room101, null);
        assertThat(desk(() -> inventory.room(room101)).occupancy().state()).isEqualTo("occupied");
        // Checking out an inspected room leaves it dirty for housekeeping.
        desk(() -> bookings.checkOut(stay.id(), stay.departAt(), "test", null, UUID.randomUUID()));
        Room after = desk(() -> inventory.room(room101));
        assertThat(after.status()).isEqualTo("dirty");
        assertThat(after.occupancy()).isNull();

        desk(() -> inventory.assign(room101, new InventoryService.HousekeepingInput(null, "high", "VIP at 2 pm"), null));
        assertThat(desk(() -> inventory.room(room101)).hkPriority()).isEqualTo("high");
        desk(() -> inventory.setStatus(room101, "cleaning", null, null, null));
        Room clean = desk(() -> inventory.setStatus(room101, "clean", null, null, null));
        assertThat(clean.hkNote()).as("a finished job clears its note").isEmpty();
        assertThat(admin.sql("select count(*) from notifications where property_id = ? and kind = 'room_ready'").param(property).query(Integer.class).single()).isPositive();
    }
}
