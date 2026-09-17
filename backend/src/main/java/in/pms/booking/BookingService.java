package in.pms.booking;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.folio.FolioService;
import in.pms.guests.GuestService;
import in.pms.money.Money;
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

    public BookingService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, SettingsService settings, FolioService folios, GuestService guests) {
        this.jdbc = jdbc; this.audit = audit; this.settings = settings; this.folios = folios; this.guests = guests;
    }

    // ---------- Inputs ----------

    /** One unit the desk picked: a room, or a bed in a dormitory room. */
    public record UnitRequest(UUID roomId, UUID bedId, Long ratePaise) {}

    public record CheckInRequest(
            UUID guestId, GuestService.GuestInput newGuest,
            List<UnitRequest> units, Integer nights, OffsetDateTime departAt,
            int adults, int children, List<Booking.Member> members, String purpose, String notes,
            boolean consent, boolean whatsappOptIn, String idPhotoSkippedReason,
            Long advancePaise, String advanceMode, Long depositPaise, UUID clientUuid) {}

    public record ReservationRequest(
            UUID guestId, GuestService.GuestInput newGuest,
            UUID roomTypeId, List<UnitRequest> units, OffsetDateTime arriveAt, OffsetDateTime departAt,
            int adults, int children, String purpose, String notes, boolean consent, boolean whatsappOptIn,
            Long advancePaise, String advanceMode, UUID clientUuid) {}

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

        List<Booking> arrivals = ids("select id from bookings where property_id = ? and state = 'reserved' and arrive_at >= ? and arrive_at < ? order by arrive_at", p, from, to);
        List<Booking> inHouse = ids("select id from bookings where property_id = ? and state = 'checked_in' order by arrive_at", p);
        List<Booking> departures = ids("select id from bookings where property_id = ? and state = 'checked_in' and depart_at >= ? and depart_at < ? order by depart_at", p, from, to);
        List<Booking> flagged = ids("select id from bookings where property_id = ? and state = 'reserved' and flagged_noshow_at is not null order by arrive_at", p);

        var free = jdbc.sql("""
                select t.name as type_name, count(*) as free
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.active and r.status <> 'blocked'
                  and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                    and coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id)
                                    and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))
                group by t.name order by t.name""").params(p, OffsetDateTime.now(), OffsetDateTime.now().plusHours(1)).query().listOfRows();

        return Map.of("date", day.toString(), "arrivals", arrivals, "inHouse", inHouse, "departures", departures, "flaggedNoShow", flagged, "freeByType", free);
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
                select r.id as room_id, r.number, r.floor, r.status, t.name as type_name, t.is_dormitory, b.id as bed_id, b.label
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.active order by r.floor, r.number, b.label""").param(p).query().listOfRows();

        var occupancy = jdbc.sql("""
                select bu.room_id, bu.bed_id, bu.arrive_at, bu.depart_at, bk.id as booking_id, bk.state::text as state, g.name as guest_name
                from booking_units bu join bookings bk on bk.id = bu.booking_id join guests g on g.id = bk.guest_id
                where bu.property_id = ? and bu.cancelled_at is null and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)')""")
                .params(p, fromTs, toTs).query().listOfRows();

        return Map.of("start", from.toString(), "days", span, "units", units, "occupancy", occupancy);
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
        addMembers(bookingId, in.members(), s);
        claimUnits(bookingId, in.units(), arrive, depart, false);

        UUID folioId = folios.create(bookingId);
        regenerateCharges(bookingId, folioId, zone, userId);
        if (in.depositPaise() != null && in.depositPaise() > 0)
            folios.addLine(folioId, new FolioService.LineInput("deposit", "Refundable deposit", 1, in.depositPaise(), LocalDate.now(zone), null), userId, null);
        if (in.advancePaise() != null && in.advancePaise() > 0)
            folios.recordPayment(folioId, new FolioService.PaymentInput(in.advanceMode() == null ? "cash" : in.advanceMode(), in.advancePaise(), "", null, null, null), userId);

        Booking created = load(bookingId);
        audit.record("bookings", bookingId.toString(), "check_in", null, summary(created), userId);
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

        UUID guestId = resolveGuest(in.guestId(), in.newGuest(), userId);
        UUID bookingId = insertBooking(guestId, "reserved", "phone", in.arriveAt(), in.departAt(), in.adults(), in.children(),
                Math.max(1, in.adults() + in.children()), in.purpose(), in.notes(), in.consent(), in.whatsappOptIn(), null, in.clientUuid(), userId);

        List<UnitRequest> units = in.units() != null && !in.units().isEmpty() ? in.units() : autoAssign(in.roomTypeId(), in.arriveAt(), in.departAt());
        claimUnits(bookingId, units, in.arriveAt(), in.departAt(), in.units() == null || in.units().isEmpty());

        UUID folioId = folios.create(bookingId);
        regenerateCharges(bookingId, folioId, zone, userId);
        if (in.advancePaise() != null && in.advancePaise() > 0)
            folios.recordPayment(folioId, new FolioService.PaymentInput(in.advanceMode() == null ? "upi" : in.advanceMode(), in.advancePaise(), "", null, null, null), userId);

        Booking created = load(bookingId);
        audit.record("bookings", bookingId.toString(), "reserve", null, summary(created), userId);
        return created;
    }

    /** Reserved to checked_in on arrival (B2). */
    @Transactional
    public Booking arrive(UUID bookingId, UUID userId) {
        Booking before = load(bookingId);
        if (!"reserved".equals(before.state())) throw new ConflictException("Booking is " + before.state());
        jdbc.sql("update bookings set state = 'checked_in', checked_in_at = now(), arrive_at = least(arrive_at, now()), flagged_noshow_at = null, updated_at = now() where id = ? and property_id = ?")
                .params(bookingId, TenantContext.require()).update();
        jdbc.sql("update booking_units set arrive_at = least(arrive_at, now()) where booking_id = ? and property_id = ? and cancelled_at is null").params(bookingId, TenantContext.require()).update();
        regenerateCharges(bookingId, before.folioId(), zone(), userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "arrive", summary(before), summary(after), userId);
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
        jdbc.sql("update booking_units set depart_at = ? where booking_id = ? and property_id = ? and cancelled_at is null").params(depart, bookingId, TenantContext.require()).update();
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
                where property_id = ? and id in (select room_id from booking_units where booking_id = ? and cancelled_at is null) and status = 'clean'""")
                .params(TenantContext.require(), bookingId).update();

        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "check_out", summary(before), summary(after), userId);
        return after;
    }

    // ---------- Changes (B5) ----------

    /** Move to another room or bed. The exclusion constraint decides whether the target is free. */
    @Transactional
    public Booking changeUnit(UUID bookingId, UUID unitId, UnitRequest target, UUID userId) {
        Booking before = load(bookingId);
        Booking.Unit unit = before.units().stream().filter(u -> u.id().equals(unitId)).findFirst().orElseThrow(() -> new NotFoundException("Unit"));
        long rate = target.ratePaise() != null ? target.ratePaise() : rateFor(target.roomId());
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
            jdbc.sql("update booking_units set depart_at = ? where booking_id = ? and property_id = ? and cancelled_at is null").params(departAt, bookingId, TenantContext.require()).update();
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
        if (!"reserved".equals(before.state())) throw new ConflictException("Only a reservation can be cancelled; this booking is " + before.state());
        releaseUnits(bookingId);
        jdbc.sql("update bookings set state = 'cancelled', cancel_reason = ?, updated_at = now() where id = ? and property_id = ?").params(reason, bookingId, TenantContext.require()).update();
        folios.regenerateRoomCharges(before.folioId(), List.of(), zone(), false, userId);
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "cancel", summary(before), Map.of("reason", reason, "approvedBy", String.valueOf(approvedBy)), userId);
        return after;
    }

    /** Mark a flagged reservation as a no-show and apply the property's advance policy. */
    @Transactional
    public Booking noShow(UUID bookingId, UUID userId, UUID approvedBy) {
        Settings s = settings.current();
        Booking before = load(bookingId);
        if (!"reserved".equals(before.state())) throw new ConflictException("Booking is " + before.state());
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
        jdbc.sql("update bookings set state = 'no_show', updated_at = now() where id = ? and property_id = ?").params(bookingId, TenantContext.require()).update();
        Booking after = load(bookingId);
        audit.record("bookings", bookingId.toString(), "no_show", summary(before), summary(after), userId);
        return after;
    }

    // ---------- Internals ----------

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
        for (var m : members) {
            if (s.registerRequiresAllNames() && m.adult() && (m.name() == null || m.name().isBlank()))
                throw new BadRequestException("Every adult's name is needed for the police register");
            jdbc.sql("insert into booking_members(property_id, booking_id, name, is_adult, id_type, id_last4) values (?, ?, ?, ?, ?::id_type, ?)")
                    .params(TenantContext.require(), bookingId, m.name().trim(), m.adult(), m.idType(), m.idLast4()).update();
        }
    }

    /** Insert one row per unit. The exclusion constraint is the availability check. */
    private void claimUnits(UUID bookingId, List<UnitRequest> units, OffsetDateTime arrive, OffsetDateTime depart, boolean autoAssigned) {
        Settings s = settings.current();
        for (UnitRequest u : units) {
            var room = jdbc.sql("select r.status::text as status, t.is_dormitory, t.base_rate_paise from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ? and r.active")
                    .params(u.roomId(), TenantContext.require()).query().listOfRows().stream().findFirst().orElseThrow(() -> new NotFoundException("Room"));
            if ("blocked".equals(room.get("status"))) throw new ConflictException("That room is blocked");
            if ("dirty".equals(room.get("status")) && !s.dirtyRoomsAssignable()) throw new ConflictException("That room is not cleaned yet");
            boolean dorm = Boolean.TRUE.equals(room.get("is_dormitory"));
            if (dorm && u.bedId() == null && !s.dormWholeRoomAllowed()) throw new BadRequestException("Pick a bed in the dormitory");
            if (!dorm && u.bedId() != null) throw new BadRequestException("That room does not have beds");
            long rate = u.ratePaise() != null ? u.ratePaise() : ((Number) room.get("base_rate_paise")).longValue();
            try {
                jdbc.sql("insert into booking_units(property_id, booking_id, room_id, bed_id, rate_paise, arrive_at, depart_at, auto_assigned) values (?, ?, ?, ?, ?, ?, ?, ?)")
                        .params(TenantContext.require(), bookingId, u.roomId(), u.bedId(), rate, arrive, depart, autoAssigned).update();
            } catch (org.springframework.dao.DataIntegrityViolationException e) { throw conflict(e); }
        }
    }

    /** Hold the first free unit of a room type so the constraint protects a reservation with no room chosen. */
    private List<UnitRequest> autoAssign(UUID roomTypeId, OffsetDateTime arrive, OffsetDateTime depart) {
        if (roomTypeId == null) throw new BadRequestException("Choose a room type");
        var row = jdbc.sql("""
                select r.id as room_id, b.id as bed_id, t.base_rate_paise
                from rooms r join room_types t on t.id = r.room_type_id
                left join beds b on b.room_id = r.id and b.active
                where r.property_id = ? and r.room_type_id = ? and r.active and r.status <> 'blocked'
                  and (t.is_dormitory = false or b.id is not null)
                  and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                    and coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id)
                                    and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))
                order by r.number, b.label limit 1""")
                .params(TenantContext.require(), roomTypeId, arrive, depart).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new ConflictException("Nothing of that type is free for those dates"));
        return List.of(new UnitRequest((UUID) row.get("room_id"), (UUID) row.get("bed_id"), ((Number) row.get("base_rate_paise")).longValue()));
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
                .query((rs, i) -> new Booking.Member(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_adult"), rs.getString("id_type"), rs.getString("id_last4"))).list();
        return jdbc.sql("""
                select b.*, g.name as guest_name, g.phone as guest_phone, f.id as folio_id,
                       coalesce(f.total_paise + f.deposit_held_paise - f.paid_paise, 0) as balance_due
                from bookings b join guests g on g.id = b.guest_id left join folios f on f.booking_id = b.id
                where b.id = ? and b.property_id = ?""").params(id, p)
                .query((rs, i) -> new Booking(rs.getObject("id", UUID.class), rs.getObject("guest_id", UUID.class), rs.getString("guest_name"), rs.getString("guest_phone"),
                        rs.getString("state"), rs.getString("source"), rs.getObject("arrive_at", OffsetDateTime.class), rs.getObject("depart_at", OffsetDateTime.class),
                        rs.getObject("checked_in_at", OffsetDateTime.class), rs.getObject("checked_out_at", OffsetDateTime.class),
                        rs.getInt("adults"), rs.getInt("children"), rs.getInt("member_count"), rs.getString("purpose"), rs.getString("notes"),
                        rs.getObject("consent_at", OffsetDateTime.class), rs.getBoolean("whatsapp_opt_in"), rs.getObject("flagged_noshow_at", OffsetDateTime.class),
                        rs.getString("cancel_reason"), rs.getObject("folio_id", UUID.class), rs.getLong("balance_due"), units, members))
                .optional().orElseThrow(() -> new NotFoundException("Booking"));
    }
}
