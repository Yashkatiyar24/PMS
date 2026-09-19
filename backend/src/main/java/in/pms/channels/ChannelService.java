package in.pms.channels;

import in.pms.audit.AuditService;
import in.pms.booking.BookingService;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.*;
import java.util.*;

/**
 * Calendar sync with the OTAs, one room at a time (iCal), and the public name of the property's booking page.
 *
 * <p>Import is a reconcile, run every 15 minutes and on "Sync now". Each OTA event is matched to what we saw
 * before by its UID:
 * <ul>
 *   <li>a new stay on a free room becomes a reservation here;</li>
 *   <li>a stay the OTA moved is moved here, while it has not started;</li>
 *   <li>a stay gone from the OTA before arrival is cancelled here;</li>
 *   <li>a stay on a room already booked here is a <b>double booking</b>: it is recorded as a conflict, never
 *       forced in, and retried on every sync so it lands by itself once the desk frees the room.</li>
 * </ul>
 * Our own bookings come back from some OTAs as "not available" blocks. One covering exactly the nights of a
 * booking here is taken as that reflection and ignored, not reported as a clash.
 */
@Service
public class ChannelService {
    public static final Map<String, String> CHANNELS = Map.of(
            "airbnb", "Airbnb", "booking_com", "Booking.com", "makemytrip", "MakeMyTrip",
            "agoda", "Agoda", "expedia", "Expedia", "other", "OTA");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcClient jdbc;
    private final JdbcClient admin;
    private final BookingService bookings;
    private final SettingsService settings;
    private final AuditService audit;

    public ChannelService(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient admin, BookingService bookings,
                          SettingsService settings, AuditService audit) {
        this.jdbc = jdbc; this.admin = admin; this.bookings = bookings; this.settings = settings; this.audit = audit;
    }

    public record Link(UUID id, UUID roomId, String roomNumber, String channel, String exportToken, String importUrl,
                       OffsetDateTime lastSyncedAt, String lastError, int conflicts) {}
    public record Conflict(UUID id, String channel, String roomNumber, LocalDate arriveOn, LocalDate departOn, String summary, String conflict) {}
    public record Room(UUID id, String number, String typeName) {}
    public record Overview(String bookingSlug, boolean onlineBookingEnabled, List<Link> links, List<Conflict> conflicts, List<Room> rooms) {}
    public record SyncResult(int added, int moved, int cancelled, int clashes) {}
    public record ExportLink(UUID linkId, UUID propertyId) {}

    // ---------- The desk ----------

    @Transactional(readOnly = true)
    public Overview overview() {
        UUID p = TenantContext.require();
        String slug = jdbc.sql("select booking_slug from properties where id = ?").param(p).query(String.class).optional().orElse(null);
        LocalDate today = LocalDate.now(zone());
        List<Link> links = jdbc.sql(LINKS + " where l.property_id = ? order by r.floor, r.number, l.channel").params(today, p).query(this::toLink).list();
        List<Conflict> conflicts = jdbc.sql("""
                select s.id, l.channel, r.number, s.arrive_on, s.depart_on, s.summary, s.conflict
                from channel_stays s join channel_links l on l.id = s.link_id join rooms r on r.id = l.room_id
                where s.property_id = ? and s.conflict is not null and s.depart_on >= ? order by s.arrive_on""")
                .params(p, today)
                .query((rs, i) -> new Conflict(rs.getObject("id", UUID.class), rs.getString("channel"), rs.getString("number"),
                        rs.getObject("arrive_on", LocalDate.class), rs.getObject("depart_on", LocalDate.class), rs.getString("summary"), rs.getString("conflict"))).list();
        // Calendar sync is per room: a dormitory's beds are sold one by one, which one calendar cannot express.
        List<Room> rooms = jdbc.sql("""
                select r.id, r.number, t.name from rooms r join room_types t on t.id = r.room_type_id
                where r.property_id = ? and r.active and not t.is_dormitory order by r.floor, r.number""")
                .param(p).query((rs, i) -> new Room(rs.getObject("id", UUID.class), rs.getString("number"), rs.getString("name"))).list();
        return new Overview(slug, settings.current().onlineBookingEnabled(), links, conflicts, rooms);
    }

    @Transactional
    public Link create(UUID roomId, String channel, String importUrl, UUID userId) {
        if (channel == null || !CHANNELS.containsKey(channel)) throw new BadRequestException("Choose an OTA");
        UUID p = TenantContext.require();
        boolean dorm = jdbc.sql("select t.is_dormitory from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ? and r.active")
                .params(roomId, p).query(Boolean.class).optional().orElseThrow(() -> new NotFoundException("Room"));
        if (dorm) throw new BadRequestException("Dormitory beds cannot be synced by calendar; link a private room");
        try {
            UUID id = jdbc.sql("insert into channel_links(property_id, room_id, channel, export_token, import_url) values (?, ?, ?, ?, ?) returning id")
                    .params(p, roomId, channel, token(), cleanUrl(importUrl)).query(UUID.class).single();
            audit.record("channel_links", id.toString(), "create", null, Map.of("roomId", roomId.toString(), "channel", channel), userId);
            return link(id);
        } catch (DuplicateKeyException e) {
            throw new ConflictException("That room is already linked to " + CHANNELS.get(channel));
        }
    }

    @Transactional
    public Link setImportUrl(UUID linkId, String importUrl, UUID userId) {
        Link before = link(linkId);
        jdbc.sql("update channel_links set import_url = ?, last_error = null where id = ? and property_id = ?")
                .params(cleanUrl(importUrl), linkId, TenantContext.require()).update();
        audit.record("channel_links", linkId.toString(), "set_import_url", before.importUrl(), importUrl, userId);
        return link(linkId);
    }

    /** A new export address; the old one stops working at once. For when an address has been shared too widely. */
    @Transactional
    public Link rotate(UUID linkId, UUID userId) {
        link(linkId);
        jdbc.sql("update channel_links set export_token = ? where id = ? and property_id = ?").params(token(), linkId, TenantContext.require()).update();
        audit.record("channel_links", linkId.toString(), "rotate_export", null, null, userId);
        return link(linkId);
    }

    /** Stops syncing. Stays already placed stay booked here; the desk decides what to do with them. */
    @Transactional
    public void delete(UUID linkId, UUID userId) {
        Link before = link(linkId);
        jdbc.sql("delete from channel_links where id = ? and property_id = ?").params(linkId, TenantContext.require()).update();
        audit.record("channel_links", linkId.toString(), "delete", Map.of("roomId", before.roomId().toString(), "channel", before.channel()), null, userId);
    }

    @Transactional(readOnly = true)
    public Link link(UUID linkId) {
        return jdbc.sql(LINKS + " where l.id = ? and l.property_id = ?").params(LocalDate.now(zone()), linkId, TenantContext.require())
                .query(this::toLink).optional().orElseThrow(() -> new NotFoundException("Channel link"));
    }

    /** The booking page's public name, made the first time the owner asks for it. */
    @Transactional
    public String ensureBookingSlug(UUID userId) {
        UUID p = TenantContext.require();
        var row = jdbc.sql("select name, booking_slug from properties where id = ?").param(p).query().singleRow();
        if (row.get("booking_slug") != null) return (String) row.get("booking_slug");
        String slug = slug((String) row.get("name"));
        jdbc.sql("update properties set booking_slug = ?, updated_at = now() where id = ?").params(slug, p).update();
        audit.record("properties", p.toString(), "booking_slug", null, slug, userId);
        return slug;
    }

    // ---------- Export: our busy nights, for the OTA ----------

    /** One room's busy nights. No names, no amounts, nothing but "Not available". */
    @Transactional(readOnly = true)
    public String exportCalendar(UUID linkId) {
        UUID p = TenantContext.require();
        ZoneId zone = zone();
        LocalDate today = LocalDate.now(zone);
        var link = jdbc.sql("""
                select l.room_id, r.number, r.status::text as status, (r.blocked_until at time zone ?)::date as blocked_until_on, pr.name as property_name
                from channel_links l join rooms r on r.id = l.room_id join properties pr on pr.id = l.property_id
                where l.id = ? and l.property_id = ?""").params(zone.getId(), linkId, p).query().singleRow();
        UUID roomId = (UUID) link.get("room_id");

        List<ICal.Event> events = new ArrayList<>(jdbc.sql("""
                select bu.id, bu.arrive_at, bu.depart_at from booking_units bu join bookings b on b.id = bu.booking_id
                where bu.property_id = ? and bu.room_id = ? and bu.cancelled_at is null and b.state::text in ('pending', 'reserved', 'checked_in')
                  and bu.depart_at > ? and bu.arrive_at < ?
                  and not exists (select 1 from channel_stays s where s.booking_id = b.id and s.link_id = ?)""")
                .params(p, roomId, today.atStartOfDay(zone).toOffsetDateTime(), today.plusYears(2).atStartOfDay(zone).toOffsetDateTime(), linkId)
                .query((rs, i) -> {
                    LocalDate from = rs.getObject("arrive_at", OffsetDateTime.class).atZoneSameInstant(zone).toLocalDate();
                    LocalDate to = rs.getObject("depart_at", OffsetDateTime.class).atZoneSameInstant(zone).toLocalDate();
                    // A day-use stay arrives and leaves on one date and still takes that night off sale.
                    return new ICal.Event(rs.getObject("id", UUID.class) + "@pms", from, to.isAfter(from) ? to : from.plusDays(1), "Not available", false);
                }).list());
        if (in.pms.inventory.InventoryService.OFF_SALE.contains((String) link.get("status"))) {
            var until = (java.sql.Date) link.get("blocked_until_on");
            LocalDate end = until == null ? today.plusYears(1) : until.toLocalDate().plusDays(1);
            events.add(new ICal.Event("blocked-" + roomId + "@pms", today, end.isAfter(today) ? end : today.plusDays(1), "Not available", false));
        }
        return ICal.render(link.get("property_name") + " " + link.get("number"), events, Instant.now());
    }

    // ---------- Import: the OTA's stays, reconciled ----------

    @Transactional(readOnly = true)
    public List<UUID> importLinks() {
        return jdbc.sql("select id from channel_links where property_id = ? and import_url is not null").param(TenantContext.require()).query(UUID.class).list();
    }

    @Transactional(readOnly = true)
    public Optional<String> importUrl(UUID linkId) {
        return Optional.ofNullable(link(linkId).importUrl());
    }

    @Transactional
    public SyncResult apply(UUID linkId, List<ICal.Event> events) {
        UUID p = TenantContext.require();
        Settings s = settings.current();
        ZoneId zone = zone();
        LocalDate today = LocalDate.now(zone);
        Link link = link(linkId);
        String channel = CHANNELS.get(link.channel());

        record Seen(UUID id, UUID bookingId, LocalDate arriveOn, LocalDate departOn, String state, String conflict) {}
        Map<String, Seen> seen = new HashMap<>();
        jdbc.sql("""
                select s.id, s.external_uid, s.booking_id, s.arrive_on, s.depart_on, s.conflict, b.state::text as state
                from channel_stays s left join bookings b on b.id = s.booking_id where s.link_id = ? and s.property_id = ?""")
                .params(linkId, p).query().listOfRows()
                .forEach(r -> seen.put((String) r.get("external_uid"), new Seen((UUID) r.get("id"), (UUID) r.get("booking_id"),
                        ((java.sql.Date) r.get("arrive_on")).toLocalDate(), ((java.sql.Date) r.get("depart_on")).toLocalDate(),
                        (String) r.get("state"), (String) r.get("conflict"))));
        Map<String, ICal.Event> incoming = new LinkedHashMap<>();
        for (ICal.Event e : events) if (!e.cancelled()) incoming.putIfAbsent(e.uid(), e);

        int added = 0, moved = 0, cancelled = 0, clashes = 0;

        // Gone from the OTA's calendar before arrival: cancelled there.
        for (var entry : seen.entrySet()) {
            if (incoming.containsKey(entry.getKey())) continue;
            Seen k = entry.getValue();
            if (k.bookingId() != null && "reserved".equals(k.state()) && !k.arriveOn().isBefore(today)) {
                bookings.cancel(k.bookingId(), "Cancelled on " + channel, null, null);
                cancelled++;
            }
            jdbc.sql("delete from channel_stays where id = ? and property_id = ?").params(k.id(), p).update();
        }

        for (ICal.Event e : incoming.values()) {
            Seen k = seen.get(e.uid());
            OffsetDateTime arrive = e.start().atTime(s.checkinTime()).atZone(zone).toOffsetDateTime();
            OffsetDateTime depart = e.end().atTime(s.checkoutTime()).atZone(zone).toOffsetDateTime();

            if (k != null && k.bookingId() != null) {
                boolean changed = !k.arriveOn().equals(e.start()) || !k.departOn().equals(e.end());
                if (!changed || !"reserved".equals(k.state())) { record(linkId, e, k.arriveOn(), k.departOn(), k.bookingId(), null); continue; }
                if (free(link.roomId(), arrive, depart, k.bookingId())) {
                    bookings.moveChannelStay(k.bookingId(), arrive, depart);
                    record(linkId, e, e.start(), e.end(), k.bookingId(), null);
                    moved++;
                } else {
                    // Keep the dates the booking really has, so the move is tried again next time.
                    record(linkId, e, k.arriveOn(), k.departOn(), k.bookingId(), channel + " moved this stay to nights room " + link.roomNumber() + " is already booked for");
                    clashes++;
                }
                continue;
            }
            if (k != null && k.conflict() == null) { record(linkId, e, e.start(), e.end(), null, null); continue; } // a known reflection
            if (!e.end().isAfter(today)) continue; // over already; nothing to hold

            if (free(link.roomId(), arrive, depart, null) && !roomBlocked(link.roomId())) {
                String notes = (channel + (e.summary().isBlank() ? "" : ": " + e.summary()));
                UUID bookingId = bookings.placeFromChannel(link.roomId(), arrive, depart, channel + " guest", notes.length() > 200 ? notes.substring(0, 200) : notes);
                record(linkId, e, e.start(), e.end(), bookingId, null);
                added++;
            } else if (k == null && sameNightsBooked(link.roomId(), e.start(), e.end(), zone)) {
                record(linkId, e, e.start(), e.end(), null, null);
            } else {
                record(linkId, e, e.start(), e.end(), null, roomBlocked(link.roomId())
                        ? "Room " + link.roomNumber() + " is blocked here"
                        : "Room " + link.roomNumber() + " is already booked here for these nights");
                clashes++;
            }
        }
        return new SyncResult(added, moved, cancelled, clashes);
    }

    @Transactional
    public void markSynced(UUID linkId, String warning) {
        jdbc.sql("update channel_links set last_synced_at = now(), last_error = ? where id = ? and property_id = ?").params(warning, linkId, TenantContext.require()).update();
    }

    @Transactional
    public void markFailed(UUID linkId, String error) {
        jdbc.sql("update channel_links set last_error = ? where id = ? and property_id = ?").params(error, linkId, TenantContext.require()).update();
    }

    // ---------- Public addresses, resolved before any tenant is known ----------

    @Transactional(value = "adminTx", readOnly = true)
    public Optional<ExportLink> resolveExport(String token) {
        if (token == null || token.length() < 20) return Optional.empty();
        return admin.sql("select l.id, l.property_id from channel_links l join properties p on p.id = l.property_id where l.export_token = ? and p.active")
                .param(token).query((rs, i) -> new ExportLink(rs.getObject("id", UUID.class), rs.getObject("property_id", UUID.class))).optional();
    }

    @Transactional(value = "adminTx", readOnly = true)
    public Optional<UUID> resolveSlug(String slug) {
        if (slug == null || slug.isBlank() || slug.length() > 80) return Optional.empty();
        return admin.sql("select id from properties where booking_slug = ? and active").param(slug).query(UUID.class).optional();
    }

    // ---------- Internals ----------

    private static final String LINKS = """
            select l.id, l.room_id, r.number, l.channel, l.export_token, l.import_url, l.last_synced_at, l.last_error,
                   (select count(*) from channel_stays s where s.link_id = l.id and s.conflict is not null and s.depart_on >= ?) as conflicts
            from channel_links l join rooms r on r.id = l.room_id""";

    private Link toLink(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Link(rs.getObject("id", UUID.class), rs.getObject("room_id", UUID.class), rs.getString("number"), rs.getString("channel"),
                rs.getString("export_token"), rs.getString("import_url"), rs.getObject("last_synced_at", OffsetDateTime.class),
                rs.getString("last_error"), rs.getInt("conflicts"));
    }

    private void record(UUID linkId, ICal.Event e, LocalDate arriveOn, LocalDate departOn, UUID bookingId, String conflict) {
        jdbc.sql("""
                insert into channel_stays(property_id, link_id, external_uid, booking_id, arrive_on, depart_on, summary, conflict)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (link_id, external_uid) do update set booking_id = excluded.booking_id, arrive_on = excluded.arrive_on,
                    depart_on = excluded.depart_on, summary = excluded.summary, conflict = excluded.conflict, seen_at = now()""")
                .params(TenantContext.require(), linkId, e.uid(), bookingId, arriveOn, departOn,
                        e.summary().length() > 200 ? e.summary().substring(0, 200) : e.summary(), conflict)
                .update();
    }

    private boolean free(UUID roomId, OffsetDateTime arrive, OffsetDateTime depart, UUID ignoreBooking) {
        return Boolean.TRUE.equals(jdbc.sql("""
                select not exists (select 1 from booking_units bu where bu.property_id = ? and bu.room_id = ? and bu.cancelled_at is null
                    and bu.booking_id is distinct from ? and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))""")
                .params(TenantContext.require(), roomId, ignoreBooking, arrive, depart).query(Boolean.class).single());
    }

    private boolean roomBlocked(UUID roomId) {
        return in.pms.inventory.InventoryService.OFF_SALE.contains(jdbc.sql("select status::text from rooms where id = ? and property_id = ?").params(roomId, TenantContext.require()).query(String.class).single());
    }

    /** A booking here covering exactly these nights: the OTA is showing our own dates back to us. */
    private boolean sameNightsBooked(UUID roomId, LocalDate from, LocalDate to, ZoneId zone) {
        return Boolean.TRUE.equals(jdbc.sql("""
                select exists (select 1 from booking_units bu where bu.property_id = ? and bu.room_id = ? and bu.cancelled_at is null
                    and (bu.arrive_at at time zone ?)::date = ? and (bu.depart_at at time zone ?)::date = ?)""")
                .params(TenantContext.require(), roomId, zone.getId(), from, zone.getId(), to).query(Boolean.class).single());
    }

    private static String cleanUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String u = url.trim();
        if (!u.regionMatches(true, 0, "https://", 0, 8)) throw new BadRequestException("A calendar address must start with https://");
        if (u.length() > 2000) throw new BadRequestException("That calendar address is too long");
        return u;
    }

    private static String token() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** "Shri Ram Dharamshala" -> "shri-ram-dharamshala-k3f9"; a name with no Latin letters becomes "stay-k3f9". */
    static String slug(String name) {
        String base = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (base.length() > 40) base = base.substring(0, 40).replaceAll("-+$", "");
        if (base.isEmpty()) base = "stay";
        StringBuilder tail = new StringBuilder();
        for (int i = 0; i < 4; i++) tail.append("abcdefghijkmnpqrstuvwxyz23456789".charAt(RANDOM.nextInt(32)));
        return base + "-" + tail;
    }

    private ZoneId zone() {
        return ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single());
    }
}
