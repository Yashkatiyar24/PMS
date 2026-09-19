package in.pms.booking;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.folio.FolioService;
import in.pms.guests.GuestService;
import in.pms.inventory.InventoryService;
import in.pms.messaging.MessageTemplates;
import in.pms.messaging.Outbox;
import in.pms.money.Money;
import in.pms.notifications.Notifier;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

/**
 * The booking lifecycle (PRD flows A–C, requirements B1–B6).
 *
 * <p>Two rules hold everywhere in this class:
 * <ul>
 *   <li>Availability is never decided by a query. Rooms are claimed by inserting {@code booking_units};
 *       the database's exclusion constraint is what prevents a double booking, so two desks racing for the
 *       last bed cannot both win. A violation surfaces as a friendly 409.</li>
 *   <li>Every state change regenerates the folio's room charges and writes an audit row, in the same transaction.</li>
 * </ul>
 */
@Service
public class BookingService {
    private final JdbcClient jdbc;
    private final AuditService audit;
    private final SettingsService settings;
    private final FolioService folios;
    private final GuestService guests;
    private final Outbox outbox;
    private final Notifier notifier;

    public BookingService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, SettingsService settings,
                          FolioService folios, GuestService guests, Outbox outbox, Notifier notifier) {
        this.jdbc = jdbc; this.audit = audit; this.settings = settings; this.folios = folios; this.guests = guests; this.outbox = outbox; this.notifier = notifier;
    }

    // ---------- Inputs ----------

    /** One unit the desk picked: a room, or a bed in a dormitory room. */
    public record UnitRequest(UUID roomId, UUID bedId, Long ratePaise) {}

    public record CheckInRequest(
            UUID guestId, GuestService.GuestInput newGuest,
            List<UnitRequest> units, Integer nights, OffsetDateTime departAt,
            int adults, int children, List<Booking.Member> members, String purpose, String notes,
            boolean consent, boolean whatsappOptIn, String idPhotoSkippedReason,
            Long advancePaise, String advanceMode, Long depositPaise, UUID clientUuid, Details details) {
        public CheckInRequest(UUID guestId, GuestService.GuestInput newGuest, List<UnitRequest> units, Integer nights, OffsetDateTime departAt,
                              int adults, int children, List<Booking.Member> members, String purpose, String notes, boolean consent, boolean whatsappOptIn,
                              String idPhotoSkippedReason, Long advancePaise, String advanceMode, Long depositPaise, UUID clientUuid) {
            this(guestId, newGuest, units, nights, departAt, adults, children, members, purpose, notes, consent, whatsappOptIn, idPhotoSkippedReason,
                    advancePaise, advanceMode, depositPaise, clientUuid, null);
        }
    }

    /**
     * An advance booking. {@code source} is how it came in (phone when unsaid); {@code tentative} makes it a
     * pending hold that lets its rooms go after {@code tentative_hold_hours} unless someone confirms it.
     */
    public record ReservationRequest(
            UUID guestId, GuestService.GuestInput newGuest,
            UUID roomTypeId, List<UnitRequest> units, OffsetDateTime arriveAt, OffsetDateTime departAt,
            int adults, int children, String purpose, String notes, boolean consent, boolean whatsappOptIn,
            Long advancePaise, String advanceMode, UUID clientUuid, String source, Boolean tentative, Details details) {
        public ReservationRequest(UUID guestId, GuestService.GuestInput newGuest, UUID roomTypeId, List<UnitRequest> units, OffsetDateTime arriveAt,
                                  OffsetDateTime departAt, int adults, int children, String purpose, String notes, boolean consent, boolean whatsappOptIn,
                                  Long advancePaise, String advanceMode, UUID clientUuid) {
            this(guestId, newGuest, roomTypeId, units, arriveAt, departAt, adults, children, purpose, notes, consent, whatsappOptIn, advancePaise, advanceMode,
                    clientUuid, null, null, null);
        }
    }

    /** What a booking carries beyond who, where and when. Every field is optional. */
    public record Details(String specialRequests, String groupName, String organization, String billingGstin) {}

    /** Sources the desk can choose; the website and the OTAs make their own bookings. */
    static final Set<String> DESK_SOURCES = Set.of("walk_in", "phone", "direct", "travel_agent", "corporate", "group", "other");

    /** What a guest types on the property's own booking page. */
    public record OnlineRequest(UUID roomTypeId, LocalDate arrive, LocalDate depart, int adults, int children,
                                String name, String phone, String city, boolean consent, boolean whatsappOptIn, UUID clientUuid, Boolean payNow) {
        public OnlineRequest(UUID roomTypeId, LocalDate arrive, LocalDate depart, int adults, int children,
                             String name, String phone, String city, boolean consent, boolean whatsappOptIn, UUID clientUuid) {
            this(roomTypeId, arrive, depart, adults, children, name, phone, city, consent, whatsappOptIn, clientUuid, null);
        }
    }

    // ---------- Read ----------

    @Transactional(readOnly = true)
    public Booking get(UUID id) { return load(id); }

    /** Today view (B6): arrivals, in-house, departures and free units, in one call. */
    @Transactional(readOnly = true)
    public Map<String, Object> today() {
        ZoneId zone = zone();
        LocalDate day = LocalDate.now(zone);
        OffsetDateTime from = day.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to = from.plusDays(1);
        UUID p = TenantContext.require();

        List<Booking> arrivals = ids("select id from bookings where property_id = ? and state::text in ('reserved', 'pending') and arrive_at >= ? and arrive_at < ? order by arrive_at", p, from, to);
        List<Booking> inHouse = ids("select id from bookings where property_id = ? and state = 'checked_in' order by arrive_at", p);
        List<Booking> departures = ids("select id from bookings where property_id = ? and state = 'checked_in' and depart_at >= ? and depart_at < ? order by depart_at", p, from, to);
        List<Booking> flagged = ids("select id from bookings where property_id = ? and state::text in ('reserved', 'pending') and flagged_noshow_at is not null order by arrive_at", p);

        var free = jdbc.sql("""
                select t.name as type_name, count(*) as free
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.active and r.status not in ('blocked', 'maintenance')
                  and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                    and (coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id) or (b.id is not null and bu.room_id = r.id and bu.bed_id is null))
                                    and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))
                group by t.name order by t.name""").params(p, OffsetDateTime.now(), OffsetDateTime.now().plusHours(1)).query().listOfRows();

        // OTA stays that could not be placed because the room is taken here: a double booking to sort out today.
        int channelConflicts = jdbc.sql("select count(*) from channel_stays where property_id = ? and conflict is not null and depart_on >= ?")
                .params(p, day).query(Integer.class).single();

        // The rest of the day's activity: who already arrived, what was booked and what was cancelled today.
        List<Booking> arrived = ids("select id from bookings where property_id = ? and state in ('checked_in', 'checked_out') and checked_in_at >= ? and checked_in_at < ? order by checked_in_at", p, from, to);
        List<Booking> booked = ids("select id from bookings where property_id = ? and created_at >= ? and created_at < ? order by created_at desc", p, from, to);
        List<Booking> cancelled = ids("select id from bookings where property_id = ? and state = 'cancelled' and updated_at >= ? and updated_at < ? order by updated_at desc", p, from, to);

        // Tonight's units: a unit is booked when a live stay holds any part of the rest of today.
        var units = jdbc.sql("""
                select
                  (select count(*) from rooms r left join beds b on b.room_id = r.id and b.active where r.property_id = ? and r.active) as total,
                  (select count(*) from rooms r left join beds b on b.room_id = r.id and b.active where r.property_id = ? and r.active and r.status in ('blocked', 'maintenance')) as blocked,
                  (select count(distinct coalesce(bu.bed_id, bu.room_id)) from booking_units bu join bookings bk on bk.id = bu.booking_id
                     where bu.property_id = ? and bu.cancelled_at is null and bk.state::text in ('pending', 'reserved', 'checked_in')
                       and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(now(), ?, '[)')) as booked""")
                .params(p, p, p, to).query().singleRow();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", day.toString());
        out.put("arrivals", arrivals);
        out.put("arrived", arrived);
        out.put("inHouse", inHouse);
        out.put("departures", departures);
        out.put("flaggedNoShow", flagged);
        out.put("booked", booked);
        out.put("cancelled", cancelled);
        out.put("freeByType", free);
        out.put("channelConflicts", channelConflicts);
        out.put("totalUnits", ((Number) units.get("total")).intValue());
        out.put("blockedUnits", ((Number) units.get("blocked")).intValue());
        out.put("bookedUnits", ((Number) units.get("booked")).intValue());
        return out;
    }

    /** Tape chart (B4): units by day for a window, in one round trip. */
    @Transactional(readOnly = true)
    public Map<String, Object> tapeChart(LocalDate start, Integer days) {
        Settings s = settings.current();
        ZoneId zone = zone();
        int span = days == null ? s.tapeChartDays() : Math.min(60, Math.max(1, days));
        LocalDate from = start == null ? LocalDate.now(zone) : start;
        OffsetDateTime fromTs = from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime toTs = from.plusDays(span).atStartOfDay(zone).toOffsetDateTime();
        UUID p = TenantContext.require();

        var units = jdbc.sql("""
                select r.id as room_id, r.number, r.floor, r.status, r.blocked_reason, t.name as type_name, t.is_dormitory, b.id as bed_id, b.label
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.active order by r.floor, r.number, b.label""").param(p).query().listOfRows();

        var occupancy = jdbc.sql("""
                select bu.id as unit_id, bu.room_id, bu.bed_id, bu.arrive_at, bu.depart_at, bk.id as booking_id, bk.state::text as state,
                       bk.source::text as source, g.name as guest_name
                from booking_units bu join bookings bk on bk.id = bu.booking_id join guests g on g.id = bk.guest_id
                where bu.property_id = ? and bu.cancelled_at is null and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)')""")
                .params(p, fromTs, toTs).query().listOfRows();

        return Map.of("start", from.toString(), "days", span, "units", units, "occupancy", occupancy);
    }

    public record SearchHit(UUID id, String state, OffsetDateTime arriveAt, OffsetDateTime departAt, String guestName, String phone, String units) {}

    /** Find a stay by guest name, phone, or the booking reference (the id's first characters). Latest first. */
    @Transactional(readOnly = true)
    public List<SearchHit> search(String query) {
        String term = query == null ? "" : query.trim();
        if (term.length() < 2) return List.of();
        String digits = term.replaceAll("\\D", "");
        String like = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.sql("""
                select b.id, b.state::text as state, b.arrive_at, b.depart_at, g.name as guest_name, g.phone,
                       (select string_agg(case when bd.label is null then r.number
                                               when bd.label like r.number || '%' then bd.label
                                               else r.number || '/' || bd.label end, ', ')
                          from booking_units bu join rooms r on r.id = bu.room_id left join beds bd on bd.id = bu.bed_id
                         where bu.booking_id = b.id and bu.cancelled_at is null) as units
                from bookings b join guests g on g.id = b.guest_id
                where b.property_id = ? and (g.name ilike ? or (length(?) >= 4 and g.phone like '%' || ? || '%') or b.id::text like lower(?) || '%')
                order by b.arrive_at desc limit 8""")
                .params(TenantContext.require(), like, digits, digits, term)
                .query((rs, i) -> new SearchHit(rs.getObject("id", UUID.class), rs.getString("state"), rs.getObject("arrive_at", OffsetDateTime.class),
                        rs.getObject("depart_at", OffsetDateTime.class), rs.getString("guest_name"), rs.getString("phone"), rs.getString("units")))
                .list();
    }

    public record Activity(OffsetDateTime at, String table, String action, String userName) {}

    /** Who did what to this stay, newest first: the booking, its rooms, its bill, payments and receipts. */
    @Transactional(readOnly = true)
    public List<Activity> activity(UUID bookingId) {
        Booking b = load(bookingId);
        String folio = b.folioId() == null ? "" : b.folioId().toString();
        return jdbc.sql("""
                select a.at, a.table_name, a.action, u.name as user_name
                from audit_log a left join users u on u.id = a.user_id
                where a.property_id = ? and (
                     (a.table_name = 'bookings' and a.row_id = ?)
                  or (a.table_name = 'booking_units' and a.row_id in (select id::text from booking_units where booking_id = ?))
                  or (a.table_name = 'folios' and a.row_id = ?)
                  or (a.table_name = 'folio_lines' and a.row_id in (select id::text from folio_lines where folio_id::text = ?))
                  or (a.table_name = 'payments' and a.row_id in (select id::text from payments where folio_id::text = ?))
                  or (a.table_name = 'receipts' and a.row_id in (select id::text from receipts where folio_id::text = ?)))
                order by a.at desc limit 60""")
                .params(TenantContext.require(), bookingId.toString(), bookingId, folio, folio, folio, folio)
                .query((rs, i) -> new Activity(rs.getObject("at", OffsetDateTime.class), rs.getString("table_name"), rs.getString("action"), rs.getString("user_name")))
                .list();
    }

    // ---------- The calendar: drag to move ----------

    /**
     * A bar dragged on the calendar: shift a reservation to another arrival date, and/or put one of its units in
     * another room or bed. Nights and times of day are kept. A guest who has arrived can change room but not
     * dates. The exclusion constraint still decides whether the target is free.
     */
    @Transactional
    public Booking move(UUID bookingId, UUID unitId, UUID roomId, UUID bedId, LocalDate arriveOn, UUID userId) {
        Booking before = load(bookingId);
        ZoneId zone = zone();
        UUID p = TenantContext.require();
        long shift = arriveOn == null ? 0 : java.time.temporal.ChronoUnit.DAYS.between(before.arriveAt().atZoneSameInstant(zone).toLocalDate(), arriveOn);
        if (shift != 0) {
            if (!Set.of("reserved", "pending").contains(before.state())) throw new ConflictException("A guest who has arrived can move to another room, not to other dates");
            if (arriveOn.isBefore(LocalDate.now(zone))) throw new BadRequestException("A reservation cannot be moved into the past");
        } else if (!LIVE.contains(before.state())) {
            throw new ConflictException("Booking is " + before.state());
        }
        try {
            if (shift != 0) {
                jdbc.sql("update bookings set arrive_at = arrive_at + make_interval(days => ?), depart_at = depart_at + make_interval(days => ?), updated_at = now() where id = ? and property_id = ?")
                        .params((int) shift, (int) shift, bookingId, p).update();
                jdbc.sql("update booking_units set arrive_at = arrive_at + make_interval(days => ?), depart_at = depart_at + make_interval(days => ?) where booking_id = ? and property_id = ? and cancelled_at is null")
                        .params((int) shift, (int) shift, bookingId, p).update();
            }
            if (unitId != null && roomId != null) {
                Booking.Unit unit = before.units().stream().filter(u -> u.id().equals(unitId)).findFirst().orElseThrow(() -> new NotFoundException("Unit"));
                if (!roomId.equals(unit.roomId()) || !Objects.equals(bedId, unit.bedId())) {
                    long rate = checkTarget(unit, roomId, bedId, null);
                    jdbc.sql("update booking_units set room_id = ?, bed_id = ?, rate_paise = ?, auto_assigned = false where id = ? and property_id = ?")
                            .params(roomId, bedId, rate, unitId, p).update();
                }
            }
        } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
        regenerateCharges(bookingId, before.folioId(), zone, userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "move", summary(before), summary(after), userId);
        return after;
    }

    // ---------- Flow A: walk-in check-in ----------

    @Transactional
    public Booking checkIn(CheckInRequest in, UUID userId) {
        Settings s = settings.current();
        if (in.clientUuid() != null) {
            var existing = jdbc.sql("select id from bookings where property_id = ? and client_uuid = ?").params(TenantContext.require(), in.clientUuid()).query(UUID.class).optional();
            if (existing.isPresent()) return load(existing.get()); // offline replay
        }
        if (s.consentRequired() && !in.consent()) throw new BadRequestException("Guest consent is required at check-in");
        if (in.units() == null || in.units().isEmpty()) throw new BadRequestException("Pick at least one room or bed");

        ZoneId zone = zone();
        OffsetDateTime arrive = OffsetDateTime.now();
        OffsetDateTime depart = in.departAt() != null ? in.departAt()
                : LocalDate.now(zone).plusDays(in.nights() == null || in.nights() < 1 ? 1 : in.nights()).atTime(s.checkoutTime()).atZone(zone).toOffsetDateTime();
        if (!depart.isAfter(arrive)) throw new BadRequestException("Departure must be after arrival");

        UUID guestId = resolveGuest(in.guestId(), in.newGuest(), userId);
        if (s.idPhotoRequired() && !hasIdPhoto(guestId) && (in.idPhotoSkippedReason() == null || in.idPhotoSkippedReason().isBlank()))
            throw new BadRequestException("An ID photo is required, or give a reason for skipping it");

        UUID bookingId = insertBooking(guestId, "checked_in", "walk_in", arrive, depart, in.adults(), in.children(),
                in.members() == null ? Math.max(1, in.adults() + in.children()) : in.members().size(), in.purpose(), in.notes(),
                in.consent(), in.whatsappOptIn(), in.idPhotoSkippedReason(), in.clientUuid(), userId);
        jdbc.sql("update bookings set checked_in_at = now() where id = ? and property_id = ?").params(bookingId, TenantContext.require()).update();
        applyDetails(bookingId, in.details());
        claimUnits(bookingId, in.units(), arrive, depart, false);
        addMembers(bookingId, in.members(), s);

        UUID folioId = folios.create(bookingId);
        regenerateCharges(bookingId, folioId, zone, userId);
        if (in.depositPaise() != null && in.depositPaise() > 0)
            folios.addLine(folioId, new FolioService.LineInput("deposit", "Refundable deposit", 1, in.depositPaise(), LocalDate.now(zone), null), userId, null);
        if (in.advancePaise() != null && in.advancePaise() > 0)
            folios.recordPayment(folioId, new FolioService.PaymentInput(in.advanceMode() == null ? "cash" : in.advanceMode(), in.advancePaise(), "", null, null, null), userId);

        Booking created = load(bookingId);
        audit.record("bookings", bookingId.toString(), "check_in", null, summary(created), userId);
        notifier.notify("check_in", "Checked in: " + created.guestName(), unitsLabel(created), "/stays/" + bookingId, Permissions.HOUSEKEEPING);
        return created;
    }

    // ---------- Flow C: advance booking ----------

    @Transactional
    public Booking reserve(ReservationRequest in, UUID userId) {
        Settings s = settings.current();
        if (in.clientUuid() != null) {
            var existing = jdbc.sql("select id from bookings where property_id = ? and client_uuid = ?").params(TenantContext.require(), in.clientUuid()).query(UUID.class).optional();
            if (existing.isPresent()) return load(existing.get());
        }
        ZoneId zone = zone();
        if (in.arriveAt() == null || in.departAt() == null || !in.departAt().isAfter(in.arriveAt())) throw new BadRequestException("Check the arrival and departure dates");

        String source = in.source() == null || in.source().isBlank() ? "phone" : in.source();
        if (!DESK_SOURCES.contains(source)) throw new BadRequestException("Source must be one of " + new TreeSet<>(DESK_SOURCES));
        boolean tentative = Boolean.TRUE.equals(in.tentative());
        UUID guestId = resolveGuest(in.guestId(), in.newGuest(), userId);
        UUID bookingId = insertBooking(guestId, tentative ? "pending" : "reserved", source, in.arriveAt(), in.departAt(), in.adults(), in.children(),
                Math.max(1, in.adults() + in.children()), in.purpose(), in.notes(), in.consent(), in.whatsappOptIn(), null, in.clientUuid(), userId);
        applyDetails(bookingId, in.details());
        if (tentative) jdbc.sql("update bookings set hold_until = now() + make_interval(hours => ?) where id = ? and property_id = ?")
                .params(s.tentativeHoldHours(), bookingId, TenantContext.require()).update();

        List<UnitRequest> units = in.units() != null && !in.units().isEmpty() ? in.units() : autoAssign(in.roomTypeId(), in.arriveAt(), in.departAt());
        claimUnits(bookingId, units, in.arriveAt(), in.departAt(), in.units() == null || in.units().isEmpty());

        UUID folioId = folios.create(bookingId);
        regenerateCharges(bookingId, folioId, zone, userId);
        if (in.advancePaise() != null && in.advancePaise() > 0)
            folios.recordPayment(folioId, new FolioService.PaymentInput(in.advanceMode() == null ? "upi" : in.advanceMode(), in.advancePaise(), "", null, null, null), userId);

        Booking created = load(bookingId);
        if (!tentative) notifyBookingConfirmed(created, s);
        audit.record("bookings", bookingId.toString(), "reserve", null, summary(created), userId);
        notifyNewBooking(created);
        return created;
    }

    // ---------- Selling online ----------

    /**
     * A booking from the property's own booking page (source "website"). The guest is a stranger, so the checks
     * the desk makes by eye are made here: a real mobile number, dates inside the property's window, a room
     * type that takes the party, and only a few open online bookings per number.
     */
    @Transactional
    public Booking reserveOnline(OnlineRequest in) { return reserveOnline(in, false); }

    /**
     * With {@code payingOnline} the booking is pending: it holds the room for {@code online_payment_hold_minutes}
     * while the guest pays, and becomes a reservation (with its confirmation message) only when the server has
     * verified the payment with the gateway. Unpaid, the hold lapses and the room is released.
     */
    @Transactional
    public Booking reserveOnline(OnlineRequest in, boolean payingOnline) {
        Settings s = settings.current();
        UUID p = TenantContext.require();
        if (in.clientUuid() != null) {
            var existing = jdbc.sql("select id from bookings where property_id = ? and client_uuid = ?").params(p, in.clientUuid()).query(UUID.class).optional();
            if (existing.isPresent()) return load(existing.get()); // the guest pressed Book twice
        }
        ZoneId zone = zone();
        checkOnlineDates(s, LocalDate.now(zone), in.arrive(), in.depart());
        if (s.consentRequired() && !in.consent()) throw new BadRequestException("Please accept the notice to continue");

        String phone = in.phone() == null ? "" : in.phone().replaceAll("\\D", "");
        if (phone.startsWith("91") && phone.length() == 12) phone = phone.substring(2);
        if (phone.length() != 10) throw new BadRequestException("Enter a 10-digit mobile number");
        int capacity = jdbc.sql("select max_occupancy from room_types where id = ? and property_id = ? and active").params(in.roomTypeId(), p)
                .query(Integer.class).optional().orElseThrow(() -> new NotFoundException("Room type"));
        if (in.adults() < 1 || in.adults() + Math.max(0, in.children()) > capacity) throw new BadRequestException("This room takes up to " + capacity + " guests");
        int open = jdbc.sql("select count(*) from bookings b join guests g on g.id = b.guest_id where b.property_id = ? and b.source = 'website' and b.state::text in ('reserved', 'pending') and g.phone = ?")
                .params(p, phone).query(Integer.class).single();
        if (open >= 3) throw new BadRequestException("This number already has open bookings here; please call the property");

        // Always a new guest record: a stranger must not be able to attach a booking to someone else's by phone.
        UUID guestId = guests.create(new GuestService.GuestInput(in.name(), phone, in.city(), "", "IN", null, null, null, null, null, ""), null).id();
        OffsetDateTime arrive = in.arrive().atTime(s.checkinTime()).atZone(zone).toOffsetDateTime();
        OffsetDateTime depart = in.depart().atTime(s.checkoutTime()).atZone(zone).toOffsetDateTime();
        UUID bookingId = insertBooking(guestId, payingOnline ? "pending" : "reserved", "website", arrive, depart, in.adults(), in.children(), Math.max(1, in.adults() + in.children()),
                null, "Booked on the property's booking page", in.consent(), in.whatsappOptIn(), null, in.clientUuid(), null);
        if (payingOnline) jdbc.sql("update bookings set hold_until = now() + make_interval(mins => ?) where id = ? and property_id = ?")
                .params(s.onlinePaymentHoldMinutes(), bookingId, p).update();
        UnitRequest unit = autoAssign(in.roomTypeId(), arrive, depart).getFirst();
        insertUnit(bookingId, unit.roomId(), unit.bedId(), unit.ratePaise(), arrive, depart, true);
        regenerateCharges(bookingId, folios.create(bookingId), zone, null);

        Booking created = load(bookingId);
        if (!payingOnline) notifyBookingConfirmed(created, s);
        audit.record("bookings", bookingId.toString(), "reserve_online", null, summary(created), null);
        notifyNewBooking(created);
        return created;
    }

    /** The dates a guest may pick online. Shared by the price check and the booking, so they never disagree. */
    public static void checkOnlineDates(Settings s, LocalDate today, LocalDate arrive, LocalDate depart) {
        if (arrive == null || depart == null || !depart.isAfter(arrive)) throw new BadRequestException("Check the arrival and departure dates");
        if (arrive.isBefore(today)) throw new BadRequestException("Arrival cannot be in the past");
        if (arrive.isAfter(today.plusDays(s.onlineBookingDaysAhead()))) throw new BadRequestException("Online booking is open up to " + s.onlineBookingDaysAhead() + " days ahead");
        if (java.time.temporal.ChronoUnit.DAYS.between(arrive, depart) > s.onlineBookingMaxNights())
            throw new BadRequestException("Online bookings are for up to " + s.onlineBookingMaxNights() + " nights; please call the property for longer stays");
    }

    /**
     * Hold a room for a stay seen on an OTA calendar (source "ota"). iCal carries no guest and no price, so the
     * guest is a placeholder named after the OTA and the rate is 0; the desk completes both on arrival. The
     * caller has checked the room is free; a desk racing it still loses to the exclusion constraint.
     */
    @Transactional
    public UUID placeFromChannel(UUID roomId, OffsetDateTime arrive, OffsetDateTime depart, String guestName, String notes) {
        UUID guestId = guests.create(new GuestService.GuestInput(guestName, "", "", "", "IN", null, null, null, null, null, ""), null).id();
        UUID bookingId = insertBooking(guestId, "reserved", "ota", arrive, depart, 1, 0, 1, null, notes, false, false, null, null, null);
        insertUnit(bookingId, roomId, null, 0L, arrive, depart, false);
        regenerateCharges(bookingId, folios.create(bookingId), zone(), null);
        Booking created = load(bookingId);
        audit.record("bookings", bookingId.toString(), "channel_import", null, summary(created), null);
        notifyNewBooking(created);
        return bookingId;
    }

    /** The OTA moved a stay. Only a reservation still waiting to arrive follows it. */
    @Transactional
    public void moveChannelStay(UUID bookingId, OffsetDateTime arrive, OffsetDateTime depart) {
        Booking before = load(bookingId);
        if (!"reserved".equals(before.state())) return;
        UUID p = TenantContext.require();
        jdbc.sql("update bookings set arrive_at = ?, depart_at = ?, updated_at = now() where id = ? and property_id = ?").params(arrive, depart, bookingId, p).update();
        try {
            jdbc.sql("update booking_units set arrive_at = ?, depart_at = ? where booking_id = ? and property_id = ? and cancelled_at is null").params(arrive, depart, bookingId, p).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
        regenerateCharges(bookingId, before.folioId(), zone(), null);
        audit.record("bookings", bookingId.toString(), "channel_move", summary(before), summary(load(bookingId)), null);
    }

    /** Reserved (or still pending) to checked_in on arrival (B2). A room taken off sale must be changed first. */
    @Transactional
    public Booking arrive(UUID bookingId, UUID userId) {
        lockState(bookingId);
        Booking before = load(bookingId);
        if (!Set.of("reserved", "pending").contains(before.state())) throw new ConflictException("Booking is " + before.state());
        for (Booking.Unit u : before.units()) {
            String status = jdbc.sql("select status::text from rooms where id = ? and property_id = ?").params(u.roomId(), TenantContext.require()).query(String.class).single();
            if (InventoryService.OFF_SALE.contains(status)) throw new ConflictException("Room " + u.roomNumber() + " is out of order or under maintenance; move the guest to another room first");
        }
        jdbc.sql("update bookings set state = 'checked_in', checked_in_at = now(), arrive_at = least(arrive_at, now()), flagged_noshow_at = null, hold_until = null, updated_at = now() where id = ? and property_id = ? and state::text in ('reserved', 'pending')")
                .params(bookingId, TenantContext.require()).update();
        jdbc.sql("update booking_units set arrive_at = least(arrive_at, now()) where booking_id = ? and property_id = ? and cancelled_at is null").params(bookingId, TenantContext.require()).update();
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "arrive", summary(before), summary(after), userId);
        notifier.notify("check_in", "Checked in: " + after.guestName(), unitsLabel(after), "/stays/" + bookingId, Permissions.HOUSEKEEPING);
        return after;
    }

    // ---------- Flow B: checkout ----------

    /**
     * Settle and leave.
     *
     * <p>Three guards, in order: leaving earlier than booked reduces the bill and needs manager approval;
     * an unpaid balance must be collected or written off by a manager with a reason; an overpaid balance must
     * be refunded first. Only then does the stay close, rooms become dirty and the invoice can be issued.
     */
    @Transactional
    public Booking checkOut(UUID bookingId, OffsetDateTime departAt, String overrideReason, UUID userId, UUID approvedBy) {
        Booking before = load(bookingId);
        if (!"checked_in".equals(before.state())) throw new ConflictException("Booking is " + before.state());
        ZoneId zone = zone();
        OffsetDateTime depart = departAt == null ? OffsetDateTime.now() : departAt;
        if (!depart.isAfter(before.arriveAt())) throw new BadRequestException("Departure must be after arrival");

        long totalBefore = folios.get(before.folioId()).totalPaise();
        jdbc.sql("update bookings set depart_at = ?, updated_at = now() where id = ? and property_id = ?").params(depart, bookingId, TenantContext.require()).update();
        // A room released early (part of a group left) keeps its own earlier departure.
        jdbc.sql("update booking_units set depart_at = ? where booking_id = ? and property_id = ? and cancelled_at is null and depart_at >= ?")
                .params(depart, bookingId, TenantContext.require(), before.departAt()).update();
        regenerateCharges(bookingId, before.folioId(), zone, userId);

        var folio = folios.get(before.folioId());
        // Leaving early drops nights off the bill, so it needs the same approval as any other reduction.
        if (folio.totalPaise() < totalBefore && approvedBy == null)
            throw new in.pms.common.ForbiddenException("Checking out early reduces the bill by "
                    + Money.format(totalBefore - folio.totalPaise()) + "; manager approval is required");

        long due = folio.balanceDuePaise();
        if (due > 0) {
            if (approvedBy == null || overrideReason == null || overrideReason.isBlank())
                throw new ConflictException("Balance of " + Money.format(due) + " is unpaid. Collect it, or get manager approval with a reason.");
            folios.setStatus(before.folioId(), "written_off", overrideReason, userId, approvedBy);
        } else if (due < 0) {
            throw new ConflictException("The guest has overpaid by " + Money.format(-due) + ". Refund it before checking out.");
        } else {
            folios.setStatus(before.folioId(), "settled", null, userId, approvedBy);
        }

        jdbc.sql("update bookings set state = 'checked_out', checked_out_at = now(), updated_at = now() where id = ? and property_id = ?").params(bookingId, TenantContext.require()).update();
        jdbc.sql("""
                update rooms set status = 'dirty', updated_at = now()
                where property_id = ? and id in (select room_id from booking_units where booking_id = ? and cancelled_at is null)
                  and status in ('clean', 'cleaning', 'inspected')""")
                .params(TenantContext.require(), bookingId).update();

        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "check_out", summary(before), summary(after), userId);
        notifier.notify("room_dirty", "Checked out: " + unitsLabel(before) + " to clean", after.guestName(), "/rooms", Permissions.HOUSEKEEPING);
        return after;
    }

    // ---------- Changes (B5) ----------

    /**
     * Move to another room or bed (a room transfer, or a bed transfer in a dormitory). The target is checked the
     * same way as a drag on the calendar; the exclusion constraint decides whether it is free.
     */
    @Transactional
    public Booking changeUnit(UUID bookingId, UUID unitId, UnitRequest target, UUID userId) {
        Booking before = load(bookingId);
        if (!LIVE.contains(before.state())) throw new ConflictException("Booking is " + before.state());
        if (target == null || target.roomId() == null) throw new BadRequestException("Pick a room or bed");
        Booking.Unit unit = before.units().stream().filter(u -> u.id().equals(unitId)).findFirst().orElseThrow(() -> new NotFoundException("Unit"));
        long rate = checkTarget(unit, target.roomId(), target.bedId(), target.ratePaise());
        try {
            jdbc.sql("update booking_units set room_id = ?, bed_id = ?, rate_paise = ?, auto_assigned = false where id = ? and property_id = ?")
                    .params(target.roomId(), target.bedId(), rate, unitId, TenantContext.require()).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("booking_units", unitId.toString(), "change_unit", unit, after.units().stream().filter(u -> u.id().equals(unitId)).findFirst().orElse(null), userId);
        return after;
    }

    /** Extend or shorten. Shortening needs manager approval because it reduces the bill. */
    @Transactional
    public Booking changeDates(UUID bookingId, OffsetDateTime departAt, UUID userId, UUID approvedBy) {
        Booking before = load(bookingId);
        if (Set.of("checked_out", "cancelled", "no_show").contains(before.state())) throw new ConflictException("Booking is " + before.state());
        if (!departAt.isAfter(before.arriveAt())) throw new BadRequestException("Departure must be after arrival");
        if (departAt.isBefore(before.departAt()) && approvedBy == null) throw new in.pms.common.ForbiddenException("Shortening a stay needs manager approval");
        try {
            jdbc.sql("update bookings set depart_at = ?, updated_at = now() where id = ? and property_id = ?").params(departAt, bookingId, TenantContext.require()).update();
            jdbc.sql("update booking_units set depart_at = ? where booking_id = ? and property_id = ? and cancelled_at is null and depart_at >= ?")
                    .params(departAt, bookingId, TenantContext.require(), before.departAt()).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "change_dates", summary(before), summary(after), userId);
        return after;
    }

    /** Cancel a reservation. Units are released; the advance follows {@code noshow_policy} only for no-shows. */
    @Transactional
    public Booking cancel(UUID bookingId, String reason, UUID userId, UUID approvedBy) {
        if (reason == null || reason.isBlank()) throw new BadRequestException("A reason is required");
        Booking before = load(bookingId);
        if (!Set.of("reserved", "pending").contains(before.state())) throw new ConflictException("Only a reservation can be cancelled; this booking is " + before.state());
        releaseUnits(bookingId);
        jdbc.sql("update bookings set state = 'cancelled', cancel_reason = ?, hold_until = null, updated_at = now() where id = ? and property_id = ?").params(reason, bookingId, TenantContext.require()).update();
        folios.regenerateRoomCharges(before.folioId(), List.of(), zone(), false, userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "cancel", summary(before), Map.of("reason", reason, "approvedBy", String.valueOf(approvedBy)), userId);
        notifier.notify("booking_cancelled", "Cancelled: " + before.guestName(), reason, "/stays/" + bookingId, Permissions.CHECKIN);
        notifyGuestCancelled(after, settings.current());
        return after;
    }

    /** Mark a flagged reservation as a no-show and apply the property's advance policy. */
    @Transactional
    public Booking noShow(UUID bookingId, UUID userId, UUID approvedBy) {
        Settings s = settings.current();
        Booking before = load(bookingId);
        if (!Set.of("reserved", "pending").contains(before.state())) throw new ConflictException("Booking is " + before.state());
        releaseUnits(bookingId);
        folios.regenerateRoomCharges(before.folioId(), List.of(), zone(), false, userId);

        var folio = folios.get(before.folioId());
        long advance = folio.paidPaise();
        if (advance > 0) {
            long keep = switch (s.noshowPolicy()) {
                case "refund" -> 0;
                case "partial" -> Money.percentBp(advance, s.noshowPartialPct() * 100);
                default -> advance;
            };
            if (keep > 0) folios.addLine(before.folioId(), new FolioService.LineInput("forfeit", "No-show charge", 1, keep, LocalDate.now(zone()), "No-show policy: " + s.noshowPolicy()), userId, approvedBy);
            if (advance - keep > 0) folios.refund(before.folioId(), new FolioService.PaymentInput("cash", advance - keep, "", null, "No-show refund", null), userId, approvedBy);
        }
        jdbc.sql("update bookings set state = 'no_show', hold_until = null, updated_at = now() where id = ? and property_id = ?").params(bookingId, TenantContext.require()).update();
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "no_show", summary(before), summary(after), userId);
        return after;
    }

    // ---------- Pending holds ----------

    /**
     * Lock the booking's row for the rest of the transaction and return its state. Whoever holds it decides the
     * booking's fate: the hold-expiry job skips a locked booking, so a payment being recorded and a hold running
     * out can never both win.
     */
    @Transactional
    public String lockState(UUID bookingId) {
        return jdbc.sql("select state::text from bookings where id = ? and property_id = ? for update").params(bookingId, TenantContext.require())
                .query(String.class).optional().orElseThrow(() -> new NotFoundException("Booking"));
    }

    /** A pending booking becomes a confirmed reservation; the guest's confirmation goes out now. */
    @Transactional
    public Booking confirm(UUID bookingId, UUID userId) {
        lockState(bookingId);
        Booking before = load(bookingId);
        if (!"pending".equals(before.state())) throw new ConflictException("Only a pending booking can be confirmed; this one is " + before.state());
        jdbc.sql("update bookings set state = 'reserved', hold_until = null, updated_at = now() where id = ? and property_id = ? and state = 'pending'").params(bookingId, TenantContext.require()).update();
        Booking after = load(bookingId);
        notifyBookingConfirmed(after, settings.current());
        audit.record("bookings", bookingId.toString(), "confirm", summary(before), summary(after), userId);
        return after;
    }

    /**
     * Pending bookings whose hold has run out let their rooms go. Run by a job, per property. A booking that is
     * waiting on an online payment the gateway has already taken is confirmed by the payment, never expired here,
     * because the payment code moves it out of pending in the same transaction that records the money.
     */
    @Transactional
    public int expireHolds() {
        List<UUID> due = jdbc.sql("select id from bookings where property_id = ? and state = 'pending' and hold_until < now() for update skip locked")
                .param(TenantContext.require()).query(UUID.class).list();
        for (UUID id : due) {
            Booking before = load(id);
            releaseUnits(id);
            jdbc.sql("update bookings set state = 'cancelled', cancel_reason = 'Hold expired', hold_until = null, updated_at = now() where id = ? and property_id = ?")
                    .params(id, TenantContext.require()).update();
            folios.regenerateRoomCharges(before.folioId(), List.of(), zone(), false, null);
            audit.record("bookings", id.toString(), "hold_expired", summary(before), Map.of("state", "cancelled"), null);
            notifier.notify("booking_cancelled", "Hold expired: " + before.guestName(), unitsLabel(before), "/stays/" + id, Permissions.CHECKIN);
        }
        return due.size();
    }

    /** Guests in the house whose checkout falls within the next {@code minutes}. */
    @Transactional(readOnly = true)
    public List<Booking> dueForCheckout(int minutes) {
        return ids("select id from bookings where property_id = ? and state = 'checked_in' and depart_at > now() and depart_at <= now() + make_interval(mins => ?) order by depart_at",
                TenantContext.require(), minutes);
    }

    /** Remind the desk that a guest leaves soon, and the guest too when they opted in. Called once per stay by a job. */
    @Transactional
    public void remindCheckout(UUID bookingId) {
        Booking b = load(bookingId);
        Settings s = settings.current();
        String time = b.departAt().atZoneSameInstant(zone()).toLocalTime().withSecond(0).withNano(0).toString();
        notifier.notify("checkout_reminder", "Checkout at " + time + ": " + b.guestName(),
                unitsLabel(b) + (b.balanceDuePaise() > 0 ? " · due " + Money.format(b.balanceDuePaise()) : ""), "/stays/" + bookingId, Permissions.CHECKOUT);
        if (s.whatsappGuestUpdates() && b.whatsappOptIn() && b.guestPhone() != null && !b.guestPhone().isBlank()) {
            String property = jdbc.sql("select name from properties where id = ?").param(TenantContext.require()).query(String.class).single();
            outbox.enqueue(TenantContext.require(), "whatsapp", MessageTemplates.checkoutReminder(b.guestName(), property, time, b.guestPhone(), s.guestLanguage()),
                    "checkout_reminder:" + bookingId + ":" + b.departAt().toLocalDate());
        }
    }

    // ---------- Details, rooms and members of a booking ----------

    /** Special requests, notes, and who the booking is for (group, company, agent, GSTIN for the invoice). */
    @Transactional
    public Booking updateDetails(UUID bookingId, Details details, String notes, UUID userId) {
        Booking before = load(bookingId);
        applyDetails(bookingId, details);
        if (notes != null) jdbc.sql("update bookings set notes = ?, updated_at = now() where id = ? and property_id = ?").params(notes.trim(), bookingId, TenantContext.require()).update();
        Booking after = load(bookingId);
        // The billed company decides CGST+SGST or IGST, so the room charges are re-priced when it changes.
        if (!Objects.equals(before.billingGstin(), after.billingGstin()) && LIVE.contains(after.state())) {
            regenerateCharges(bookingId, after.folioId(), zone(), userId);
            after = load(bookingId);
        }
        audit.record("bookings", bookingId.toString(), "details", details(before), details(after), userId);
        return after;
    }

    /**
     * One more room or bed for the stay, for its remaining nights: a group that needs another room, a family that
     * takes a second one. The exclusion constraint decides whether it is free.
     */
    @Transactional
    public Booking addUnit(UUID bookingId, UnitRequest unit, UUID userId) {
        Booking before = load(bookingId);
        if (!LIVE.contains(before.state())) throw new ConflictException("Booking is " + before.state());
        if (unit == null || unit.roomId() == null) throw new BadRequestException("Pick a room or bed");
        OffsetDateTime arrive = "checked_in".equals(before.state()) ? OffsetDateTime.now() : before.arriveAt();
        if (!before.departAt().isAfter(arrive)) throw new ConflictException("The stay has already ended");
        claimUnits(bookingId, List.of(unit), arrive, before.departAt(), false);
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "add_unit", summary(before), summary(after), userId);
        return after;
    }

    /**
     * Give back one of the stay's rooms or beds while keeping the rest: part of a group leaves early. Before
     * arrival the unit is simply cancelled; a guest in the house is charged up to now and the room goes to
     * housekeeping. Reduces the bill, so the controller asks for approval.
     */
    @Transactional
    public Booking releaseUnit(UUID bookingId, UUID unitId, UUID userId, UUID approvedBy) {
        Booking before = load(bookingId);
        if (!LIVE.contains(before.state())) throw new ConflictException("Booking is " + before.state());
        Booking.Unit unit = before.units().stream().filter(u -> u.id().equals(unitId)).findFirst().orElseThrow(() -> new NotFoundException("Unit"));
        // A room given back earlier has its own, earlier departure: it is ended already.
        List<Booking.Unit> held = before.units().stream().filter(u -> !u.departAt().isBefore(before.departAt())).toList();
        if (!held.contains(unit)) throw new ConflictException("That room has already been given back");
        if (held.size() < 2) throw new BadRequestException("A stay keeps at least one room; cancel or check out instead");
        UUID p = TenantContext.require();
        OffsetDateTime now = OffsetDateTime.now();
        if ("checked_in".equals(before.state()) && now.isAfter(unit.arriveAt())) {
            jdbc.sql("update booking_units set depart_at = ? where id = ? and property_id = ?").params(now, unitId, p).update();
            // Still counted on the bill up to now, so it stays live; it is ended rather than cancelled.
            jdbc.sql("update rooms set status = 'dirty', updated_at = now() where id = ? and property_id = ? and status in ('clean', 'cleaning', 'inspected')")
                    .params(unit.roomId(), p).update();
        } else {
            jdbc.sql("update booking_units set cancelled_at = now() where id = ? and property_id = ?").params(unitId, p).update();
        }
        jdbc.sql("update booking_members set unit_id = null where unit_id = ? and property_id = ?").params(unitId, p).update();
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("booking_units", unitId.toString(), "release_unit", unit, Map.of("approvedBy", String.valueOf(approvedBy)), userId);
        return after;
    }

    /** The party, replaced as a whole: names for the register, and which room or bed each one sleeps in. */
    @Transactional
    public Booking setMembers(UUID bookingId, List<Booking.Member> members, UUID userId) {
        Booking before = load(bookingId);
        if (Set.of("cancelled", "no_show").contains(before.state())) throw new ConflictException("Booking is " + before.state());
        UUID p = TenantContext.require();
        jdbc.sql("delete from booking_members where booking_id = ? and property_id = ?").params(bookingId, p).update();
        List<Booking.Member> list = members == null ? List.of() : members;
        addMembers(bookingId, list, settings.current());
        int adults = (int) list.stream().filter(Booking.Member::adult).count();
        if (!list.isEmpty()) jdbc.sql("update bookings set member_count = ?, adults = greatest(adults, ?), children = greatest(children, ?), updated_at = now() where id = ? and property_id = ?")
                .params(list.size(), adults, list.size() - adults, bookingId, p).update();
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "members", before.members(), after.members(), userId);
        return after;
    }

    public record FreeUnit(UUID roomId, UUID bedId, String roomNumber, String bedLabel, UUID roomTypeId, String typeName, long ratePaise,
                           boolean dormitory, String status, String building, int floor) {}

    /**
     * Rooms and beds free for the whole of a stay, on sale, grouped by type in the caller. Advisory only: the
     * exclusion constraint still decides when the desk actually takes one.
     */
    @Transactional(readOnly = true)
    public List<FreeUnit> availability(OffsetDateTime arrive, OffsetDateTime depart) {
        if (arrive == null || depart == null || !depart.isAfter(arrive)) throw new BadRequestException("Check the arrival and departure dates");
        return jdbc.sql("""
                select r.id as room_id, b.id as bed_id, r.number, b.label, t.id as type_id, t.name as type_name, t.base_rate_paise, t.is_dormitory,
                       r.status::text as status, r.building, r.floor
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.active and t.active and r.status not in ('blocked', 'maintenance')
                  and (t.is_dormitory = false or b.id is not null)
                  and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                    and (coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id) or (b.id is not null and bu.room_id = r.id and bu.bed_id is null))
                                    and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))
                order by t.sort_order, t.name, r.building, r.floor, r.number, b.label""")
                .params(TenantContext.require(), arrive, depart)
                .query((rs, i) -> new FreeUnit(rs.getObject("room_id", UUID.class), rs.getObject("bed_id", UUID.class), rs.getString("number"), rs.getString("label"),
                        rs.getObject("type_id", UUID.class), rs.getString("type_name"), rs.getLong("base_rate_paise"), rs.getBoolean("is_dormitory"),
                        rs.getString("status"), rs.getString("building"), rs.getInt("floor"))).list();
    }

    // ---------- Internals ----------

    /**
     * Queue the guest's confirmation. Only with an opt-in (Meta policy and PRD G5), only when the property has
     * WhatsApp on, and only as an outbox row: a messaging outage must never fail a booking.
     */
    private void notifyBookingConfirmed(Booking b, Settings s) {
        if (!s.whatsappEnabled() || !b.whatsappOptIn() || b.guestPhone() == null || b.guestPhone().isBlank()) return;
        var property = jdbc.sql("select name, phone from properties where id = ?").param(TenantContext.require()).query().listOfRows().get(0);
        var folio = folios.get(b.folioId());
        outbox.enqueue(TenantContext.require(), "whatsapp", MessageTemplates.bookingConfirmed(
                b.guestName(), String.valueOf(property.get("name")),
                b.arriveAt().atZoneSameInstant(zone()).toLocalDate().toString(),
                b.departAt().atZoneSameInstant(zone()).toLocalDate().toString(),
                b.units().stream().map(Booking.Unit::label).reduce((x, y) -> x + ", " + y).orElse(""),
                folio.paidPaise(), String.valueOf(property.get("phone")), b.guestPhone(), s.guestLanguage()),
                "booking_confirmed:" + b.id());
    }

    /** The staff hear about a new booking wherever it came from: desk, website or an OTA. */
    private void notifyNewBooking(Booking b) {
        String when = b.arriveAt().atZoneSameInstant(zone()).toLocalDate() + " → " + b.departAt().atZoneSameInstant(zone()).toLocalDate();
        notifier.notify("new_booking", "New booking: " + b.guestName() + ("pending".equals(b.state()) ? " (pending)" : ""),
                when + " · " + unitsLabel(b), "/stays/" + b.id(), Permissions.CHECKIN);
    }

    /** The guest hears their booking was cancelled, with the same opt-in rule as the confirmation. */
    private void notifyGuestCancelled(Booking b, Settings s) {
        if (!s.whatsappGuestUpdates() || !b.whatsappOptIn() || b.guestPhone() == null || b.guestPhone().isBlank()) return;
        var property = jdbc.sql("select name, phone from properties where id = ?").param(TenantContext.require()).query().listOfRows().get(0);
        outbox.enqueue(TenantContext.require(), "whatsapp", MessageTemplates.bookingCancelled(b.guestName(), String.valueOf(property.get("name")),
                b.arriveAt().atZoneSameInstant(zone()).toLocalDate().toString(), String.valueOf(property.get("phone")), b.guestPhone(), s.guestLanguage()),
                "booking_cancelled:" + b.id());
    }

    private static String unitsLabel(Booking b) { return b.units().stream().map(Booking.Unit::label).reduce((x, y) -> x + ", " + y).orElse(""); }

    /** Only what was sent is changed; a GSTIN must look like one. */
    private void applyDetails(UUID bookingId, Details d) {
        if (d == null) return;
        String gstin = d.billingGstin() == null ? null : d.billingGstin().trim().toUpperCase();
        if (gstin != null && !gstin.isEmpty() && !gstin.matches("\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]")) throw new BadRequestException("GSTIN format is invalid");
        jdbc.sql("""
                update bookings set special_requests = coalesce(?, special_requests), group_name = coalesce(?, group_name),
                       organization = coalesce(?, organization), billing_gstin = coalesce(?, billing_gstin), updated_at = now()
                where id = ? and property_id = ?""")
                .params(trim(d.specialRequests(), 1000), blankToEmpty(d.groupName()), blankToEmpty(d.organization()), gstin, bookingId, TenantContext.require()).update();
        // An empty value clears the field; null left it alone above.
        jdbc.sql("update bookings set group_name = nullif(group_name, ''), organization = nullif(organization, ''), billing_gstin = nullif(billing_gstin, '') where id = ? and property_id = ?")
                .params(bookingId, TenantContext.require()).update();
    }

    private static String trim(String s, int max) { if (s == null) return null; String v = s.trim(); return v.length() > max ? v.substring(0, max) : v; }
    private static String blankToEmpty(String s) { return s == null ? null : trim(s, 200); }

    private static Map<String, Object> details(Booking b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("specialRequests", b.specialRequests()); m.put("groupName", String.valueOf(b.groupName())); m.put("organization", String.valueOf(b.organization()));
        m.put("billingGstin", String.valueOf(b.billingGstin())); m.put("notes", b.notes());
        return m;
    }

    private void regenerateCharges(UUID bookingId, UUID folioId, ZoneId zone, UUID userId) {
        boolean hasGstin = jdbc.sql("select gstin is not null and gstin <> '' from properties where id = ?").param(TenantContext.require()).query(Boolean.class).single();
        List<FolioService.Unit> units = jdbc.sql("""
                select bu.id, bu.rate_paise, bu.arrive_at, bu.depart_at, r.number, b.label
                from booking_units bu join rooms r on r.id = bu.room_id left join beds b on b.id = bu.bed_id
                where bu.booking_id = ? and bu.property_id = ? and bu.cancelled_at is null""")
                .params(bookingId, TenantContext.require())
                .query((rs, i) -> new FolioService.Unit(rs.getObject("id", UUID.class),
                        rs.getString("label") == null ? rs.getString("number") : rs.getString("number") + "/" + rs.getString("label"),
                        rs.getLong("rate_paise"), rs.getObject("arrive_at", OffsetDateTime.class), rs.getObject("depart_at", OffsetDateTime.class))).list();
        folios.regenerateRoomCharges(folioId, units, zone, hasGstin, userId);
    }

    private UUID resolveGuest(UUID guestId, GuestService.GuestInput newGuest, UUID userId) {
        if (guestId != null) { guests.get(guestId); return guestId; }
        if (newGuest == null) throw new BadRequestException("Pick an existing guest or enter a new one");
        return guests.create(newGuest, userId).id();
    }

    private boolean hasIdPhoto(UUID guestId) {
        return Boolean.TRUE.equals(jdbc.sql("select id_photo_key is not null from guests where id = ? and property_id = ?").params(guestId, TenantContext.require()).query(Boolean.class).single());
    }

    private UUID insertBooking(UUID guestId, String state, String source, OffsetDateTime arrive, OffsetDateTime depart, int adults, int children, int members,
                               String purpose, String notes, boolean consent, boolean optIn, String skipReason, UUID clientUuid, UUID userId) {
        return jdbc.sql("""
                insert into bookings(property_id, guest_id, state, source, arrive_at, depart_at, adults, children, member_count, purpose, notes,
                                     consent_at, whatsapp_opt_in, id_photo_skipped_reason, client_uuid, created_by)
                values (?, ?, ?::booking_state, ?::booking_source, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), guestId, state, source, arrive, depart, Math.max(1, adults), Math.max(0, children), Math.max(1, members),
                        purpose == null || purpose.isBlank() ? "pilgrimage" : purpose.trim(), notes == null ? "" : notes.trim(),
                        consent ? OffsetDateTime.now() : null, optIn, skipReason, clientUuid, userId)
                .query(UUID.class).single();
    }

    private void addMembers(UUID bookingId, List<Booking.Member> members, Settings s) {
        if (members == null || members.isEmpty()) return;
        UUID p = TenantContext.require();
        Set<UUID> units = new HashSet<>(jdbc.sql("select id from booking_units where booking_id = ? and property_id = ? and cancelled_at is null").params(bookingId, p).query(UUID.class).list());
        for (var m : members) {
            if (s.registerRequiresAllNames() && m.adult() && (m.name() == null || m.name().isBlank()))
                throw new BadRequestException("Every adult's name is needed for the police register");
            if (m.name() == null || m.name().isBlank()) continue; // an unnamed child adds nothing to the register
            if (m.unitId() != null && !units.contains(m.unitId())) throw new BadRequestException("A member can only be put in one of this stay's rooms or beds");
            String last4 = m.idLast4() == null || m.idLast4().isBlank() ? null : m.idLast4().trim();
            if (last4 != null && !last4.matches("[A-Za-z0-9]{4}")) throw new BadRequestException("ID last 4 must be exactly 4 characters");
            jdbc.sql("insert into booking_members(property_id, booking_id, name, is_adult, id_type, id_last4, unit_id) values (?, ?, ?, ?, ?::id_type, ?, ?)")
                    .params(p, bookingId, m.name().trim(), m.adult(), m.idType() == null || m.idType().isBlank() ? null : m.idType(), last4, m.unitId()).update();
        }
    }

    /** Insert one row per unit. The exclusion constraint is the availability check. */
    private void claimUnits(UUID bookingId, List<UnitRequest> units, OffsetDateTime arrive, OffsetDateTime depart, boolean autoAssigned) {
        Settings s = settings.current();
        for (UnitRequest u : units) {
            var room = jdbc.sql("select r.status::text as status, t.is_dormitory, t.base_rate_paise from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ? and r.active")
                    .params(u.roomId(), TenantContext.require()).query().listOfRows().stream().findFirst().orElseThrow(() -> new NotFoundException("Room"));
            if (InventoryService.OFF_SALE.contains((String) room.get("status"))) throw new ConflictException("That room is out of order or under maintenance");
            if (Set.of("dirty", "cleaning").contains((String) room.get("status")) && !s.dirtyRoomsAssignable()) throw new ConflictException("That room is not cleaned yet");
            boolean dorm = Boolean.TRUE.equals(room.get("is_dormitory"));
            if (dorm && u.bedId() == null && !s.dormWholeRoomAllowed()) throw new BadRequestException("Pick a bed in the dormitory");
            if (!dorm && u.bedId() != null) throw new BadRequestException("That room does not have beds");
            long rate = u.ratePaise() != null ? u.ratePaise() : ((Number) room.get("base_rate_paise")).longValue();
            insertUnit(bookingId, u.roomId(), u.bedId(), rate, arrive, depart, autoAssigned);
        }
    }

    /** One claimed unit. The exclusion constraint is the availability check; losing a race is a 409. */
    private void insertUnit(UUID bookingId, UUID roomId, UUID bedId, long rate, OffsetDateTime arrive, OffsetDateTime depart, boolean autoAssigned) {
        try {
            jdbc.sql("insert into booking_units(property_id, booking_id, room_id, bed_id, rate_paise, arrive_at, depart_at, auto_assigned) values (?, ?, ?, ?, ?, ?, ?, ?)")
                    .params(TenantContext.require(), bookingId, roomId, bedId, rate, arrive, depart, autoAssigned).update();
        } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
    }

    /** Hold the first free unit of a room type so the constraint protects a reservation with no room chosen. */
    private List<UnitRequest> autoAssign(UUID roomTypeId, OffsetDateTime arrive, OffsetDateTime depart) {
        if (roomTypeId == null) throw new BadRequestException("Choose a room type");
        var row = jdbc.sql("""
                select r.id as room_id, b.id as bed_id, t.base_rate_paise
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.room_type_id = ? and r.active and r.status not in ('blocked', 'maintenance')
                  and (t.is_dormitory = false or b.id is not null)
                  and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                    and (coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id) or (b.id is not null and bu.room_id = r.id and bu.bed_id is null))
                                    and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))
                order by r.number, b.label limit 1""")
                .params(TenantContext.require(), roomTypeId, arrive, depart).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ConflictException("Nothing of that type is free for those dates"));
        return List.of(new UnitRequest((UUID) row.get("room_id"), (UUID) row.get("bed_id"), ((Number) row.get("base_rate_paise")).longValue()));
    }

    /** Stays that hold rooms: a reservation (confirmed or awaiting payment) and a guest in the house. */
    static final Set<String> LIVE = Set.of("pending", "reserved", "checked_in");

    /**
     * Checks the room or bed a unit is moving to and returns the rate to charge there. The room must be this
     * property's, on sale, and of the right shape (a bed in a dormitory, no bed elsewhere). The same kind of room
     * keeps the agreed rate; a different kind takes that room's rate, unless the desk named one.
     */
    private long checkTarget(Booking.Unit unit, UUID roomId, UUID bedId, Long explicitRate) {
        UUID p = TenantContext.require();
        var target = jdbc.sql("select r.status::text as status, r.room_type_id, t.is_dormitory from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ? and r.active")
                .params(roomId, p).query().listOfRows().stream().findFirst().orElseThrow(() -> new NotFoundException("Room"));
        if (InventoryService.OFF_SALE.contains((String) target.get("status"))) throw new ConflictException("That room is out of order or under maintenance");
        boolean dorm = Boolean.TRUE.equals(target.get("is_dormitory"));
        if (dorm && bedId == null && !settings.current().dormWholeRoomAllowed()) throw new BadRequestException("Pick a bed in the dormitory");
        if (!dorm && bedId != null) throw new BadRequestException("That room does not have beds");
        if (bedId != null && jdbc.sql("select count(*) from beds where id = ? and room_id = ? and property_id = ? and active").params(bedId, roomId, p).query(Integer.class).single() == 0)
            throw new NotFoundException("Bed");
        if (explicitRate != null) {
            if (explicitRate < 0) throw new BadRequestException("A rate cannot be negative");
            return explicitRate;
        }
        UUID fromType = jdbc.sql("select room_type_id from rooms where id = ? and property_id = ?").params(unit.roomId(), p).query(UUID.class).single();
        return fromType.equals(target.get("room_type_id")) ? unit.ratePaise() : rateFor(roomId);
    }

    private void releaseUnits(UUID bookingId) {
        jdbc.sql("update booking_units set cancelled_at = now() where booking_id = ? and property_id = ? and cancelled_at is null").params(bookingId, TenantContext.require()).update();
    }

    private long rateFor(UUID roomId) {
        return jdbc.sql("select t.base_rate_paise from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ?")
                .params(roomId, TenantContext.require()).query(Long.class).optional().orElseThrow(() -> new NotFoundException("Room"));
    }

    private static ConflictException conflict(org.springframework.dao.DataIntegrityViolationException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        if (msg.contains("booking_units_no_overlap")) return new ConflictException("That room or bed is already taken for those dates");
        throw e;
    }

    private ZoneId zone() {
        return ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single());
    }

    private List<Booking> ids(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(UUID.class).list().stream().map(this::load).toList();
    }

    private static Map<String, Object> summary(Booking b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("state", b.state()); m.put("arriveAt", String.valueOf(b.arriveAt())); m.put("departAt", String.valueOf(b.departAt()));
        m.put("units", b.units().stream().map(Booking.Unit::label).toList());
        m.put("balanceDuePaise", b.balanceDuePaise());
        return m;
    }

    private Booking load(UUID id) {
        UUID p = TenantContext.require();
        List<Booking.Unit> units = jdbc.sql("""
                select bu.*, r.number, b.label from booking_units bu join rooms r on r.id = bu.room_id left join beds b on b.id = bu.bed_id
                where bu.booking_id = ? and bu.property_id = ? and bu.cancelled_at is null order by r.number""")
                .params(id, p).query((rs, i) -> new Booking.Unit(rs.getObject("id", UUID.class), rs.getObject("room_id", UUID.class), rs.getString("number"),
                        rs.getObject("bed_id", UUID.class), rs.getString("label"), rs.getLong("rate_paise"),
                        rs.getObject("arrive_at", OffsetDateTime.class), rs.getObject("depart_at", OffsetDateTime.class), rs.getBoolean("auto_assigned"))).list();
        List<Booking.Member> members = jdbc.sql("select * from booking_members where booking_id = ? and property_id = ? order by is_adult desc, name").params(id, p)
                .query((rs, i) -> new Booking.Member(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_adult"), rs.getString("id_type"), rs.getString("id_last4"),
                        rs.getObject("unit_id", UUID.class))).list();
        return jdbc.sql("""
                select b.*, g.name as guest_name, g.phone as guest_phone, f.id as folio_id,
                       coalesce(f.total_paise + f.deposit_held_paise - f.paid_paise, 0) as balance_due,
                       coalesce(f.total_paise, 0) as total_paise, coalesce(f.paid_paise, 0) as paid_paise
                from bookings b join guests g on g.id = b.guest_id left join folios f on f.booking_id = b.id
                where b.id = ? and b.property_id = ?""").params(id, p)
                .query((rs, i) -> new Booking(rs.getObject("id", UUID.class), rs.getObject("guest_id", UUID.class), rs.getString("guest_name"), rs.getString("guest_phone"),
                        rs.getString("state"), rs.getString("source"), rs.getObject("arrive_at", OffsetDateTime.class), rs.getObject("depart_at", OffsetDateTime.class),
                        rs.getObject("checked_in_at", OffsetDateTime.class), rs.getObject("checked_out_at", OffsetDateTime.class),
                        rs.getInt("adults"), rs.getInt("children"), rs.getInt("member_count"), rs.getString("purpose"), rs.getString("notes"),
                        rs.getObject("consent_at", OffsetDateTime.class), rs.getBoolean("whatsapp_opt_in"), rs.getObject("flagged_noshow_at", OffsetDateTime.class),
                        rs.getString("cancel_reason"), rs.getObject("folio_id", UUID.class), rs.getLong("balance_due"), units, members,
                        rs.getObject("created_at", OffsetDateTime.class), rs.getLong("total_paise"), rs.getLong("paid_paise"),
                        Booking.paymentStatus(rs.getLong("total_paise"), rs.getLong("paid_paise"), rs.getLong("balance_due")),
                        rs.getString("special_requests"), rs.getString("group_name"), rs.getString("organization"), rs.getString("billing_gstin"),
                        rs.getObject("hold_until", OffsetDateTime.class)))
                .optional().orElseThrow(() -> new NotFoundException("Booking"));
    }
}
