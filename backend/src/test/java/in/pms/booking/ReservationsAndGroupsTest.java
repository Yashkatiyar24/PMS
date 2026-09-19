package in.pms.booking;

import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.folio.FolioService;
import in.pms.guests.GuestService;
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
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pending holds, sources and details, and a pilgrim group: many beds, one bill, members allocated, part leaving early. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReservationsAndGroupsTest {
    @Autowired BookingService bookings;
    @Autowired FolioService folios;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    UUID org, property, stdType, room101, room102, dorm;
    List<UUID> beds;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Group Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone, settings) values (?, 'Group Test', 'Asia/Kolkata', '{\"id_photo_required\":false}'::jsonb) returning id").param(org).query(UUID.class).single();
            stdType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            UUID dormType = admin.sql("insert into room_types(property_id, name, base_rate_paise, is_dormitory, bed_count) values (?, 'Dorm', 20000, true, 4) returning id").param(property).query(UUID.class).single();
            room101 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, stdType).query(UUID.class).single();
            room102 = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '102') returning id").params(property, stdType).query(UUID.class).single();
            dorm = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, 'D1') returning id").params(property, dormType).query(UUID.class).single();
            beds = List.of("D1-1", "D1-2", "D1-3", "D1-4").stream()
                    .map(l -> admin.sql("insert into beds(property_id, room_id, label) values (?, ?, ?) returning id").params(property, dorm, l).query(UUID.class).single()).toList();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("receipts", "receipt_counters", "payments", "folio_lines", "folios", "booking_members", "booking_units", "bookings", "guests", "beds", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id = ?").param(property).update();
            admin.sql("delete from properties where id = ?").param(property).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T desk(Supplier<T> body) { return TenantContext.runAs(property, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }

    OffsetDateTime day(int d, int hour) { return LocalDate.now(ZONE).plusDays(d).atTime(hour, 0).atZone(ZONE).toOffsetDateTime(); }

    static GuestService.GuestInput guest(String name) { return new GuestService.GuestInput(name, "", "", "", "IN", null, null, null, null, null, ""); }

    Booking reserve(List<BookingService.UnitRequest> units, int from, int nights, String source, Boolean tentative, BookingService.Details details) {
        return desk(() -> bookings.reserve(new BookingService.ReservationRequest(null, guest("Leader"), null, units, day(from, 14), day(from + nights, 10),
                2, 0, null, null, true, false, null, null, null, source, tentative, details), null));
    }

    @Test
    void aTentativeHoldIsPendingUntilConfirmedAndLetsItsRoomGoWhenItRunsOut() {
        Booking hold = reserve(List.of(new BookingService.UnitRequest(room101, null, null)), 10, 1, "corporate", true,
                new BookingService.Details("Late arrival", null, "Acme Pvt Ltd", "09AAACH7409R1ZZ"));
        assertThat(hold.state()).isEqualTo("pending");
        assertThat(hold.holdUntil()).isNotNull();
        assertThat(hold.source()).isEqualTo("corporate");
        assertThat(hold.organization()).isEqualTo("Acme Pvt Ltd");
        assertThat(hold.billingGstin()).isEqualTo("09AAACH7409R1ZZ");
        assertThat(hold.paymentStatus()).isEqualTo("unpaid");
        // The hold still protects the room.
        assertThatThrownBy(() -> reserve(List.of(new BookingService.UnitRequest(room101, null, null)), 10, 1, null, null, null))
                .isInstanceOf(ConflictException.class);

        Booking confirmed = desk(() -> bookings.confirm(hold.id(), null));
        assertThat(confirmed.state()).isEqualTo("reserved");
        assertThat(confirmed.holdUntil()).isNull();

        Booking second = reserve(List.of(new BookingService.UnitRequest(room102, null, null)), 12, 1, "travel_agent", true, null);
        new TransactionTemplate(adminTx).executeWithoutResult(tx ->
                admin.sql("update bookings set hold_until = now() - interval '1 minute' where id = ?").param(second.id()).update());
        assertThat(desk(() -> bookings.expireHolds())).isEqualTo(1);
        assertThat(desk(() -> bookings.get(second.id())).state()).isEqualTo("cancelled");
        // ...and the room is free again.
        reserve(List.of(new BookingService.UnitRequest(room102, null, null)), 12, 1, null, null, null);
    }

    @Test
    void aSourceMustBeOneTheDeskCanChooseAndAGstinMustLookLikeOne() {
        assertThatThrownBy(() -> reserve(List.of(new BookingService.UnitRequest(room101, null, null)), 30, 1, "ota", null, null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("Source");
        assertThatThrownBy(() -> reserve(List.of(new BookingService.UnitRequest(room101, null, null)), 30, 1, "corporate", null,
                new BookingService.Details(null, null, "Acme", "NOT-A-GSTIN"))).hasMessageContaining("GSTIN");
    }

    @Test
    void aPilgrimGroupTakesManyBedsOnOneBillAndPartOfItCanLeaveEarly() {
        Booking group = reserve(List.of(new BookingService.UnitRequest(dorm, beds.get(0), null), new BookingService.UnitRequest(dorm, beds.get(1), null)),
                0, 2, "group", null, new BookingService.Details("Ground floor please", "Shri Ram Yatra, Indore", "Yatra Committee", null));
        assertThat(group.units()).hasSize(2);
        assertThat(group.groupName()).isEqualTo("Shri Ram Yatra, Indore");

        // One more bed for a late joiner, and the members allocated to the beds.
        Booking bigger = desk(() -> bookings.addUnit(group.id(), new BookingService.UnitRequest(dorm, beds.get(2), null), null));
        assertThat(bigger.units()).hasSize(3);
        UUID bed1 = bigger.units().stream().filter(u -> u.bedId().equals(beds.get(0))).findFirst().orElseThrow().id();
        UUID bed3 = bigger.units().stream().filter(u -> u.bedId().equals(beds.get(2))).findFirst().orElseThrow().id();
        Booking allocated = desk(() -> bookings.setMembers(group.id(), List.of(
                new Booking.Member(null, "Ram Prasad", true, "voter", "1234", bed1),
                new Booking.Member(null, "Sita Devi", true, null, null, bed3)), null));
        assertThat(allocated.members()).extracting(Booking.Member::unitId).containsExactlyInAnyOrder(bed1, bed3);
        assertThatThrownBy(() -> desk(() -> bookings.setMembers(group.id(), List.of(new Booking.Member(null, "Stranger", true, null, null, UUID.randomUUID())), null)))
                .hasMessageContaining("rooms or beds");

        // The free-unit list for the same nights no longer offers those beds.
        var free = desk(() -> bookings.availability(group.arriveAt(), group.departAt()));
        assertThat(free).extracting(BookingService.FreeUnit::bedId).doesNotContain(beds.get(0), beds.get(1), beds.get(2)).contains(beds.get(3));

        // They arrive; one member leaves early and gives the bed back. The bill keeps the nights already used.
        Booking in = desk(() -> bookings.arrive(group.id(), null));
        long before = desk(() -> folios.get(in.folioId())).totalPaise();
        UUID leaving = in.units().stream().filter(u -> u.bedId().equals(beds.get(2))).findFirst().orElseThrow().id();
        Booking after = desk(() -> bookings.releaseUnit(group.id(), leaving, null, null));
        assertThat(desk(() -> folios.get(after.folioId())).totalPaise()).isLessThan(before).isPositive();
        assertThat(after.members()).filteredOn(m -> m.name().equals("Sita Devi")).singleElement().satisfies(m -> assertThat(m.unitId()).isNull());
        // Given back once is given back: a second release would re-extend it to now and bill the extra hours.
        assertThatThrownBy(() -> desk(() -> bookings.releaseUnit(group.id(), leaving, null, null))).isInstanceOf(ConflictException.class);

        // The whole group checks out together; the released bed keeps its early departure.
        long due = desk(() -> folios.get(after.folioId())).balanceDuePaise();
        desk(() -> folios.recordPayment(after.folioId(), new FolioService.PaymentInput("cash", due, "", null, null, null), null));
        Booking out = desk(() -> bookings.checkOut(group.id(), after.departAt(), null, null, null));
        assertThat(out.state()).isEqualTo("checked_out");
        assertThat(out.units()).filteredOn(u -> u.id().equals(leaving)).singleElement()
                .satisfies(u -> assertThat(u.departAt()).isBefore(out.departAt()));
        assertThat(out.paymentStatus()).isEqualTo("paid");
    }
}
