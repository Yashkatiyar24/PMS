package in.pms.inventory;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.notifications.Notifier;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Room types, rooms and dormitory beds (PRD P2, P3, H1), and the housekeeping cycle. All writes are audited. */
@Service
public class InventoryService {
    private static final Pattern RANGE = Pattern.compile("^\\s*(\\d+)\\s*-\\s*(\\d+)\\s*$");
    /** Housekeeping states. Off-sale ones need a reason. Occupied / reserved / available come from bookings. */
    public static final Set<String> STATUSES = Set.of("clean", "dirty", "cleaning", "inspected", "blocked", "maintenance");
    public static final Set<String> OFF_SALE = Set.of("blocked", "maintenance");
    private static final Set<String> PRIORITIES = Set.of("low", "normal", "high");

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final Notifier notifier;

    public InventoryService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, Notifier notifier) { this.jdbc = jdbc; this.audit = audit; this.notifier = notifier; }

    // ---------- Room types ----------

    public record RoomTypeInput(String name, long baseRatePaise, int maxOccupancy, long extraPersonPaise, boolean dormitory, int bedCount, int sortOrder, boolean active,
                                List<String> amenities) {}

    @Transactional(readOnly = true)
    public List<RoomType> roomTypes() {
        return jdbc.sql("select * from room_types where property_id = ? order by sort_order, name").param(TenantContext.require()).query(this::mapRoomType).list();
    }

    @Transactional
    public RoomType createRoomType(RoomTypeInput in, UUID userId) {
        validate(in);
        UUID id = jdbc.sql("""
                insert into room_types(property_id, name, base_rate_paise, max_occupancy, extra_person_paise, is_dormitory, bed_count, sort_order, active, amenities)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), in.name().trim(), in.baseRatePaise(), in.maxOccupancy(), in.extraPersonPaise(), in.dormitory(), in.dormitory() ? in.bedCount() : 0, in.sortOrder(), in.active(),
                        amenities(in.amenities(), List.of()))
                .query(UUID.class).single();
        RoomType created = roomType(id);
        audit.record("room_types", id.toString(), "create", null, created, userId);
        return created;
    }

    @Transactional
    public RoomType updateRoomType(UUID id, RoomTypeInput in, UUID userId) {
        validate(in);
        RoomType before = roomType(id);
        if (before.dormitory() != in.dormitory()) throw new BadRequestException("A room type cannot change between room and dormitory; create a new type");
        jdbc.sql("""
                update room_types set name = ?, base_rate_paise = ?, max_occupancy = ?, extra_person_paise = ?, bed_count = ?, sort_order = ?, active = ?, amenities = ?, updated_at = now()
                where id = ? and property_id = ?""")
                .params(in.name().trim(), in.baseRatePaise(), in.maxOccupancy(), in.extraPersonPaise(), in.dormitory() ? in.bedCount() : 0, in.sortOrder(), in.active(),
                        amenities(in.amenities(), before.amenities()), id, TenantContext.require()).update();
        RoomType after = roomType(id);
        audit.record("room_types", id.toString(), "update", before, after, userId);
        return after;
    }

    /** Tidied amenity names; a client that does not send the list keeps what is there. */
    private static String[] amenities(List<String> in, List<String> keep) {
        List<String> source = in == null ? keep : in;
        return source.stream().map(String::trim).filter(s -> !s.isEmpty()).map(s -> s.length() > 40 ? s.substring(0, 40) : s).distinct().limit(30).toArray(String[]::new);
    }

    private static void validate(RoomTypeInput in) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        if (in.baseRatePaise() < 0 || in.extraPersonPaise() < 0) throw new BadRequestException("Rates cannot be negative");
        if (in.maxOccupancy() < 1) throw new BadRequestException("Max occupancy must be at least 1");
        if (in.dormitory() && in.bedCount() < 1) throw new BadRequestException("A dormitory needs at least one bed");
    }

    private RoomType roomType(UUID id) {
        return jdbc.sql("select * from room_types where id = ? and property_id = ?").params(id, TenantContext.require()).query(this::mapRoomType).optional().orElseThrow(() -> new NotFoundException("Room type"));
    }

    private RoomType mapRoomType(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        java.sql.Array a = rs.getArray("amenities");
        List<String> amenities = a == null ? List.of() : List.of((String[]) a.getArray());
        return new RoomType(rs.getObject("id", UUID.class), rs.getString("name"), rs.getLong("base_rate_paise"), rs.getInt("max_occupancy"),
                rs.getLong("extra_person_paise"), rs.getBoolean("is_dormitory"), rs.getInt("bed_count"), rs.getInt("sort_order"), rs.getBoolean("active"), amenities);
    }

    // ---------- Rooms ----------

    public record RoomInput(UUID roomTypeId, String number, int floor, boolean active, String building) {}
    public record BulkRoomsInput(UUID roomTypeId, String range, int floor, String building) {}

    @Transactional(readOnly = true)
    public List<Room> rooms() {
        UUID p = TenantContext.require();
        Map<UUID, Room.Occupancy> occupancy = occupancy();
        Map<UUID, List<Room.Bed>> beds = new HashMap<>();
        jdbc.sql("select id, room_id, label, active from beds where property_id = ? order by label").param(p).query(rs -> {
            UUID room = rs.getObject("room_id", UUID.class), bed = rs.getObject("id", UUID.class);
            beds.computeIfAbsent(room, k -> new ArrayList<>()).add(new Room.Bed(bed, rs.getString("label"), rs.getBoolean("active"),
                    occupancy.getOrDefault(bed, occupancy.get(room))));
        });
        return jdbc.sql(ROOM_SELECT + " where r.property_id = ? order by r.building, r.floor, r.number").param(p)
                .query((rs, i) -> room(rs, beds.getOrDefault(rs.getObject("id", UUID.class), List.of()), occupancy)).list();
    }

    private static final String ROOM_SELECT = """
            select r.*, t.name as type_name, u.name as housekeeper_name
            from rooms r join room_types t on t.id = r.room_type_id left join users u on u.id = r.housekeeper_id""";

    /**
     * Who is in each unit now, keyed by bed (or by room, for a room or a whole dormitory). A checked-in stay
     * occupies its unit until checkout, even past its planned departure; a reservation holds it when it arrives
     * before tonight is over.
     */
    private Map<UUID, Room.Occupancy> occupancy() {
        UUID p = TenantContext.require();
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(p).query(String.class).single());
        OffsetDateTime endOfToday = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        Map<UUID, Room.Occupancy> out = new HashMap<>();
        jdbc.sql("""
                select coalesce(bu.bed_id, bu.room_id) as unit, bk.id as booking_id, bk.state::text as state, g.name as guest_name, bu.depart_at
                from booking_units bu join bookings bk on bk.id = bu.booking_id join guests g on g.id = bk.guest_id
                where bu.property_id = ? and bu.cancelled_at is null
                  and ((bk.state = 'checked_in' and (bu.depart_at > now() or bu.depart_at >= bk.depart_at))   -- in the house, even overstaying; not a room given back early
                       or (bk.state::text in ('reserved', 'pending') and bu.arrive_at < ? and bu.depart_at > now()))
                order by bk.state = 'checked_in'""")   // occupied last, so it wins over a reservation for the same unit
                .params(p, endOfToday)
                .query(rs -> {
                    String state = "checked_in".equals(rs.getString("state")) ? "occupied" : "reserved";
                    out.put(rs.getObject("unit", UUID.class), new Room.Occupancy(state, rs.getObject("booking_id", UUID.class), rs.getString("guest_name"),
                            rs.getObject("depart_at", OffsetDateTime.class)));
                });
        return out;
    }

    @Transactional
    public Room createRoom(RoomInput in, UUID userId) {
        if (in.number() == null || in.number().isBlank()) throw new BadRequestException("Room number is required");
        RoomType type = roomType(in.roomTypeId());
        UUID id = jdbc.sql("insert into rooms(property_id, room_type_id, number, floor, active, building) values (?, ?, ?, ?, ?, ?) returning id")
                .params(TenantContext.require(), type.id(), in.number().trim(), in.floor(), in.active(), nz(in.building())).query(UUID.class).single();
        if (type.dormitory()) for (int b = 1; b <= type.bedCount(); b++)
            jdbc.sql("insert into beds(property_id, room_id, label) values (?, ?, ?)").params(TenantContext.require(), id, in.number().trim() + "-" + b).update();
        Room created = room(id);
        audit.record("rooms", id.toString(), "create", null, created, userId);
        return created;
    }

    /** "101-140" creates forty rooms; existing numbers are skipped and reported. */
    @Transactional
    public List<Room> createRooms(BulkRoomsInput in, UUID userId) {
        Matcher m = RANGE.matcher(in.range() == null ? "" : in.range());
        if (!m.matches()) throw new BadRequestException("Range must look like 101-140");
        int from = Integer.parseInt(m.group(1)), to = Integer.parseInt(m.group(2));
        if (to < from || to - from > 500) throw new BadRequestException("Range must be ascending and at most 500 rooms");
        Set<String> existing = new HashSet<>(jdbc.sql("select number from rooms where property_id = ?").param(TenantContext.require()).query(String.class).list());
        List<Room> created = new ArrayList<>();
        for (int n = from; n <= to; n++) {
            if (existing.contains(String.valueOf(n))) continue;
            created.add(createRoom(new RoomInput(in.roomTypeId(), String.valueOf(n), in.floor(), true, in.building()), userId));
        }
        return created;
    }

    @Transactional
    public Room updateRoom(UUID id, RoomInput in, UUID userId) {
        Room before = room(id);
        // A room cannot become a dormitory or stop being one: its beds and their bookings would no longer fit it.
        if (roomType(in.roomTypeId()).dormitory() != roomType(before.roomTypeId()).dormitory())
            throw new BadRequestException("A room cannot change between a dormitory and an ordinary room; add a new room instead");
        jdbc.sql("update rooms set room_type_id = ?, number = ?, floor = ?, active = ?, building = ?, updated_at = now() where id = ? and property_id = ?")
                .params(in.roomTypeId(), in.number().trim(), in.floor(), in.active(), in.building() == null ? before.building() : in.building().trim(), id, TenantContext.require()).update();
        Room after = room(id);
        audit.record("rooms", id.toString(), "update", before, after, userId);
        return after;
    }

    /**
     * Housekeeping status. Taking a room off sale (blocked, maintenance) needs a reason; the cleaning cycle
     * (dirty, cleaning, clean, inspected) flips in one tap (PRD H1, H2). A room that comes back clean has
     * finished its cleaning job, so its assignment is cleared.
     */
    @Transactional
    public Room setStatus(UUID id, String status, String reason, OffsetDateTime until, UUID userId) {
        if (!STATUSES.contains(status)) throw new BadRequestException("Status must be one of " + new TreeSet<>(STATUSES));
        boolean offSale = OFF_SALE.contains(status);
        if (offSale && (reason == null || reason.isBlank())) throw new BadRequestException("A reason is required to take a room off sale");
        Room before = room(id);
        boolean done = Set.of("clean", "inspected").contains(status);
        jdbc.sql("""
                update rooms set status = ?::room_status, blocked_reason = ?, blocked_until = ?,
                       housekeeper_id = case when ? then null else housekeeper_id end,
                       hk_note = case when ? then '' else hk_note end,
                       hk_priority = case when ? then 'normal' else hk_priority end,
                       updated_at = now()
                where id = ? and property_id = ?""")
                .params(status, offSale ? reason : null, offSale ? until : null, done, done, done, id, TenantContext.require()).update();
        Room after = room(id);
        audit.record("rooms", id.toString(), "status", Map.of("status", before.status()), Map.of("status", status, "reason", reason == null ? "" : reason), userId);
        if (!before.status().equals(status)) {
            if (done && after.occupancy() == null)
                notifier.notify("room_ready", "Room " + after.number() + " is ready", after.roomTypeName(), "/rooms", Permissions.CHECKIN);
            else if ("dirty".equals(status))
                notifier.notify("room_dirty", "Room " + after.number() + " needs cleaning", after.hkNote(), "/rooms", Permissions.HOUSEKEEPING);
        }
        return after;
    }

    public record HousekeepingInput(UUID housekeeperId, String priority, String note) {}

    /** Give a room to a housekeeper, with a priority and a note ("VIP arriving 2 pm", "change all linen"). */
    @Transactional
    public Room assign(UUID id, HousekeepingInput in, UUID userId) {
        String priority = in.priority() == null || in.priority().isBlank() ? "normal" : in.priority();
        if (!PRIORITIES.contains(priority)) throw new BadRequestException("Priority must be low, normal or high");
        if (in.housekeeperId() != null && housekeepers().stream().noneMatch(h -> h.id().equals(in.housekeeperId())))
            throw new BadRequestException("That person does not do housekeeping here");
        Room before = room(id);
        String note = in.note() == null ? "" : in.note().trim();
        jdbc.sql("update rooms set housekeeper_id = ?, hk_priority = ?, hk_note = ?, updated_at = now() where id = ? and property_id = ?")
                .params(in.housekeeperId(), priority, note.length() > 300 ? note.substring(0, 300) : note, id, TenantContext.require()).update();
        Room after = room(id);
        audit.record("rooms", id.toString(), "assign", Map.of("housekeeper", String.valueOf(before.housekeeperId()), "priority", before.hkPriority()),
                Map.of("housekeeper", String.valueOf(after.housekeeperId()), "priority", after.hkPriority(), "note", after.hkNote()), userId);
        return after;
    }

    public record Person(UUID id, String name, String role) {}

    /** Active members whose role cleans rooms: who a room can be given to. */
    @Transactional(readOnly = true)
    public List<Person> housekeepers() {
        String[] roles = Permissions.rolesWith(Permissions.HOUSEKEEPING).toArray(String[]::new);
        return jdbc.sql("""
                select u.id, u.name, pu.role::text as role from property_users pu join users u on u.id = pu.user_id
                where pu.property_id = ? and pu.active and u.active and pu.role::text = any(?) order by u.name""")
                .params(TenantContext.require(), roles).query((rs, i) -> new Person(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("role"))).list();
    }

    // ---------- Beds ----------

    /** One more bed in a dormitory room. */
    @Transactional
    public Room addBed(UUID roomId, String label, UUID userId) {
        Room room = room(roomId);
        boolean dorm = jdbc.sql("select is_dormitory from room_types where id = ? and property_id = ?").params(room.roomTypeId(), TenantContext.require()).query(Boolean.class).single();
        if (!dorm) throw new BadRequestException("Only a dormitory room has beds");
        String name = label == null || label.isBlank() ? room.number() + "-" + (room.beds().size() + 1) : label.trim();
        if (room.beds().stream().anyMatch(b -> b.label().equalsIgnoreCase(name))) throw new BadRequestException("That bed already exists");
        UUID id = jdbc.sql("insert into beds(property_id, room_id, label) values (?, ?, ?) returning id").params(TenantContext.require(), roomId, name).query(UUID.class).single();
        audit.record("beds", id.toString(), "create", null, Map.of("room", room.number(), "label", name), userId);
        return room(roomId);
    }

    /** Take a bed out of use, or back. Its bookings stay; it is just not offered any more. */
    @Transactional
    public Room setBedActive(UUID bedId, boolean active, UUID userId) {
        UUID roomId = jdbc.sql("select room_id from beds where id = ? and property_id = ?").params(bedId, TenantContext.require()).query(UUID.class).optional()
                .orElseThrow(() -> new NotFoundException("Bed"));
        jdbc.sql("update beds set active = ? where id = ? and property_id = ?").params(active, bedId, TenantContext.require()).update();
        audit.record("beds", bedId.toString(), active ? "activate" : "deactivate", null, null, userId);
        return room(roomId);
    }

    @Transactional(readOnly = true)
    public Room room(UUID id) {
        Map<UUID, Room.Occupancy> occupancy = occupancy();
        List<Room.Bed> beds = jdbc.sql("select id, label, active from beds where room_id = ? and property_id = ? order by label").params(id, TenantContext.require())
                .query((rs, i) -> new Room.Bed(rs.getObject("id", UUID.class), rs.getString("label"), rs.getBoolean("active"),
                        occupancy.getOrDefault(rs.getObject("id", UUID.class), occupancy.get(id)))).list();
        return jdbc.sql(ROOM_SELECT + " where r.id = ? and r.property_id = ?")
                .params(id, TenantContext.require()).query((rs, i) -> room(rs, beds, occupancy)).optional().orElseThrow(() -> new NotFoundException("Room"));
    }

    private static Room room(java.sql.ResultSet rs, List<Room.Bed> beds, Map<UUID, Room.Occupancy> occupancy) throws java.sql.SQLException {
        UUID id = rs.getObject("id", UUID.class);
        return new Room(id, rs.getObject("room_type_id", UUID.class), rs.getString("type_name"), rs.getString("number"), rs.getInt("floor"),
                rs.getString("status"), rs.getString("blocked_reason"), rs.getObject("blocked_until", OffsetDateTime.class), rs.getBoolean("active"), beds,
                rs.getString("building"), rs.getObject("housekeeper_id", UUID.class), rs.getString("housekeeper_name"), rs.getString("hk_priority"), rs.getString("hk_note"),
                occupancy.get(id));
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }
}
