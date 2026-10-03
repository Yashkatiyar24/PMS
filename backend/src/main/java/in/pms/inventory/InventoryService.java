package in.pms.inventory;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.config.RoomDefaults;
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
    private final RoomDefaults defaults;

    public InventoryService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, Notifier notifier, RoomDefaults defaults) {
        this.jdbc = jdbc; this.audit = audit; this.notifier = notifier; this.defaults = defaults;
    }

    /** The shape a new property opens with, so the setup screen can offer it and the owner can change it. */
    public RoomDefaults defaults() { return defaults; }

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

    /** {@code name}, {@code bedType} and {@code description} are the room's own; its rate and occupancy come from its type. */
    public record RoomInput(UUID roomTypeId, String number, int floor, boolean active, String building,
                            String name, String bedType, String description) {
        public RoomInput(UUID roomTypeId, String number, int floor, boolean active, String building) {
            this(roomTypeId, number, floor, active, building, null, null, null);
        }
    }
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
        String number = number(in.number());
        if (in.floor() < 0 || in.floor() > defaults.maxFloors()) throw new BadRequestException("Floor must be between 0 and " + defaults.maxFloors());
        // The type is read inside this property, so a room can never be given another property's room type.
        RoomType type = roomType(in.roomTypeId());
        UUID id;
        try {
            id = jdbc.sql("""
                    insert into rooms(property_id, room_type_id, number, floor, active, building, name, bed_type, description)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                    .params(TenantContext.require(), type.id(), number, in.floor(), in.active(), nz(in.building()),
                            cap(in.name(), 60), cap(in.bedType(), 30), cap(in.description(), 500)).query(UUID.class).single();
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BadRequestException("Room " + number + " already exists here");
        }
        if (type.dormitory()) for (int b = 1; b <= type.bedCount(); b++)
            jdbc.sql("insert into beds(property_id, room_id, label) values (?, ?, ?)").params(TenantContext.require(), id, number + "-" + b).update();
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
        String number = number(in.number());
        if (in.floor() < 0 || in.floor() > defaults.maxFloors()) throw new BadRequestException("Floor must be between 0 and " + defaults.maxFloors());
        // A room cannot become a dormitory or stop being one: its beds and their bookings would no longer fit it.
        if (roomType(in.roomTypeId()).dormitory() != roomType(before.roomTypeId()).dormitory())
            throw new BadRequestException("A room cannot change between a dormitory and an ordinary room; add a new room instead");
        if (before.active() && !in.active()) refuseIfBooked(before);
        try {
            jdbc.sql("""
                    update rooms set room_type_id = ?, number = ?, floor = ?, active = ?, building = ?,
                           name = ?, bed_type = ?, description = ?, updated_at = now()
                    where id = ? and property_id = ?""")
                    .params(in.roomTypeId(), number, in.floor(), in.active(),
                            in.building() == null ? before.building() : in.building().trim(),
                            in.name() == null ? before.name() : cap(in.name(), 60),
                            in.bedType() == null ? before.bedType() : cap(in.bedType(), 30),
                            in.description() == null ? before.description() : cap(in.description(), 500),
                            id, TenantContext.require()).update();
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new BadRequestException("Room " + number + " already exists here");
        }
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

    // ---------- Floors ----------

    /**
     * The property's floors: every floor that has rooms on it, plus any that has been named or added ahead of
     * its rooms. Derived and stored are merged here so a floor cannot go missing from the screen merely
     * because nobody named it.
     */
    @Transactional(readOnly = true)
    public List<Floor> floors() {
        UUID p = TenantContext.require();
        return jdbc.sql("""
                select f.id, n.number, coalesce(f.name, '') as name, coalesce(f.sort_order, n.number) as sort_order,
                       (select count(*) from rooms r where r.property_id = ? and r.floor = n.number) as rooms
                from (select distinct floor as number from rooms where property_id = ?
                      union select number from floors where property_id = ?) n
                left join floors f on f.property_id = ? and f.number = n.number
                order by sort_order, n.number""")
                .params(p, p, p, p)
                .query((rs, i) -> new Floor(rs.getObject("id", UUID.class), rs.getInt("number"), rs.getString("name"),
                        rs.getInt("sort_order"), rs.getInt("rooms"))).list();
    }

    public record FloorInput(int number, String name, Integer sortOrder) {}

    /** Name a floor, or add one before its rooms exist. A floor already there is renamed rather than refused. */
    @Transactional
    public Floor saveFloor(FloorInput in, UUID userId) {
        if (in.number() < 0 || in.number() > defaults.maxFloors())
            throw new BadRequestException("Floor must be between 0 and " + defaults.maxFloors());
        String name = in.name() == null ? "" : in.name().trim();
        if (name.length() > 40) name = name.substring(0, 40);
        jdbc.sql("""
                insert into floors(property_id, number, name, sort_order) values (?, ?, ?, ?)
                on conflict (property_id, number) do update set name = excluded.name, sort_order = excluded.sort_order, updated_at = now()""")
                .params(TenantContext.require(), in.number(), name, in.sortOrder() == null ? in.number() : in.sortOrder()).update();
        audit.record("floors", String.valueOf(in.number()), "save", null, Map.of("name", name), userId);
        return floors().stream().filter(f -> f.number() == in.number()).findFirst().orElseThrow(() -> new NotFoundException("Floor"));
    }

    /**
     * Forget a floor's label. Its rooms are not touched — a floor is only a name here, and emptying it of
     * rooms is done by moving or deactivating them, each of which checks its own bookings.
     */
    @Transactional
    public void deleteFloor(int number, UUID userId) {
        int rooms = jdbc.sql("select count(*) from rooms where property_id = ? and floor = ?")
                .params(TenantContext.require(), number).query(Integer.class).single();
        if (rooms > 0) throw new BadRequestException("Floor " + number + " still has " + rooms + " rooms; move or deactivate them first");
        jdbc.sql("delete from floors where property_id = ? and number = ?").params(TenantContext.require(), number).update();
        audit.record("floors", String.valueOf(number), "delete", null, null, userId);
    }

    // ---------- Laying out the rooms ----------

    /** One floor of a plan: how many rooms the owner wants on it, and what to call it. */
    public record FloorSpec(int floor, int rooms, String name) {}
    /** A plan the owner asked for; {@code apply} false is the preview the setup screen shows first. */
    public record SetupInput(List<FloorSpec> floors, UUID roomTypeId, boolean apply) {}
    /**
     * What a plan would do to one floor.
     *
     * @param create  numbers that do not exist yet and would be added
     * @param keep    numbers already there that the plan covers; they are never recreated or renumbered
     * @param surplus rooms beyond what the plan asks for. Nothing happens to them: reducing an inventory is a
     *                decision about which rooms, which only the owner can make, so they are reported for the
     *                screen to offer and left exactly where they are.
     */
    public record FloorPlan(int floor, String name, List<String> create, List<String> keep, List<String> surplus) {}
    public record SetupPlan(List<FloorPlan> floors, int total, int created, int kept, int surplus) {}

    /**
     * Lay out, or re-lay out, a property's rooms.
     *
     * <p>The same method answers the preview and does the work, so what the owner confirms is exactly what
     * happens. It only ever adds: a number that already exists is left alone (so going from 25 rooms to 40
     * adds fifteen and renumbers nothing), and a floor asked to shrink reports its surplus rooms instead of
     * deleting anything. Rooms hold bookings and history; nothing here destroys one.
     */
    @Transactional
    public SetupPlan setup(SetupInput in, UUID userId) {
        List<FloorSpec> wanted;
        wanted = in == null || in.floors() == null || in.floors().isEmpty()
                ? defaults.defaultPlan().stream().map(f -> new FloorSpec(f[0], f[1], null)).toList()
                : in.floors();
        if (wanted.size() > defaults.maxFloors()) throw new BadRequestException("At most " + defaults.maxFloors() + " floors");
        for (FloorSpec f : wanted) {
            if (f.floor() < 0 || f.floor() > defaults.maxFloors()) throw new BadRequestException("Floor must be between 0 and " + defaults.maxFloors());
            if (f.rooms() < 0 || f.rooms() > defaults.maxRoomsPerFloor())
                throw new BadRequestException("A floor can have at most " + defaults.maxRoomsPerFloor() + " rooms");
        }
        if (wanted.stream().map(FloorSpec::floor).distinct().count() != wanted.size())
            throw new BadRequestException("The same floor is listed twice");

        // A plan describes the whole building, so a floor the owner left out of it is a floor they are asking
        // for nothing on. Its rooms are not deleted — they are counted as surplus and reported, which is the
        // only way "take me from 25 rooms down to 20" can be answered honestly.
        var named = wanted.stream().map(FloorSpec::floor).collect(java.util.stream.Collectors.toSet());
        var forgotten = jdbc.sql("select distinct floor from rooms where property_id = ? order by floor")
                .param(TenantContext.require()).query(Integer.class).list().stream()
                .filter(floor -> !named.contains(floor)).map(floor -> new FloorSpec(floor, 0, null)).toList();
        wanted = java.util.stream.Stream.concat(wanted.stream(), forgotten.stream()).toList();

        UUID type = in != null && in.roomTypeId() != null ? roomType(in.roomTypeId()).id() : defaultType(userId);
        Set<String> taken = new HashSet<>(jdbc.sql("select number from rooms where property_id = ?").param(TenantContext.require()).query(String.class).list());
        List<FloorPlan> plans = new ArrayList<>();

        for (FloorSpec spec : wanted) {
            List<String> onFloor = jdbc.sql("select number from rooms where property_id = ? and floor = ? order by number")
                    .params(TenantContext.require(), spec.floor()).query(String.class).list();
            List<String> create = new ArrayList<>(), keep = new ArrayList<>();
            // Numbering walks past anything already taken, so a plan never collides with a renamed room.
            for (int n = 1, made = 0; made < spec.rooms() && n <= defaults.maxRoomsPerFloor() * 2; n++) {
                String number = defaults.number(spec.floor(), n);
                if (taken.contains(number)) { keep.add(number); made++; }
                else { create.add(number); taken.add(number); made++; }
            }
            List<String> surplus = onFloor.stream().filter(number -> !keep.contains(number)).toList();
            plans.add(new FloorPlan(spec.floor(), spec.name() == null ? "" : spec.name().trim(), create, keep, surplus));
        }

        if (in != null && in.apply()) {
            for (FloorPlan plan : plans) {
                saveFloor(new FloorInput(plan.floor(), plan.name(), plan.floor()), userId);
                for (String number : plan.create()) createRoom(new RoomInput(type, number, plan.floor(), true, null), userId);
            }
            audit.record("rooms", TenantContext.require().toString(), "setup", null,
                    Map.of("floors", plans.stream().map(FloorPlan::floor).toList(),
                           "created", plans.stream().mapToInt(f -> f.create().size()).sum()), userId);
        }
        return new SetupPlan(plans,
                plans.stream().mapToInt(f -> f.create().size() + f.keep().size()).sum(),
                plans.stream().mapToInt(f -> f.create().size()).sum(),
                plans.stream().mapToInt(f -> f.keep().size()).sum(),
                plans.stream().mapToInt(f -> f.surplus().size()).sum());
    }

    /** The type new rooms are made with when the owner has not said: the first one there is, else a Standard. */
    private UUID defaultType(UUID userId) {
        var existing = roomTypes().stream().filter(RoomType::active).findFirst();
        if (existing.isPresent()) return existing.get().id();
        return createRoomType(new RoomTypeInput(defaults.defaultTypeName(), 0, defaults.defaultMaxOccupancy(), 0,
                false, 0, 0, true, List.of()), userId).id();
    }

    /** The number to offer for one more room on a floor: the next one free in that floor's own series. */
    @Transactional(readOnly = true)
    public String nextNumber(int floor) {
        Set<String> taken = new HashSet<>(jdbc.sql("select number from rooms where property_id = ?").param(TenantContext.require()).query(String.class).list());
        for (int n = 1; n <= defaults.maxRoomsPerFloor() * 2; n++) {
            String number = defaults.number(floor, n);
            if (!taken.contains(number)) return number;
        }
        return "";
    }

    public record BulkUpdateInput(List<UUID> roomIds, UUID roomTypeId, Integer floor, Boolean active) {}

    /**
     * One change across a block of rooms: the five rooms the owner just selected become Deluxe, or move to
     * another floor, or go out of use. Each room goes through the single-room path, so every rule that holds
     * for one room — its property, its type, a booking that stops it being deactivated — holds for all of them,
     * and the whole block is one transaction: either they all change or none does.
     */
    @Transactional
    public List<Room> bulkUpdate(BulkUpdateInput in, UUID userId) {
        if (in.roomIds() == null || in.roomIds().isEmpty()) throw new BadRequestException("Select at least one room");
        if (in.roomIds().size() > 500) throw new BadRequestException("That is too many rooms at once");
        if (in.roomTypeId() == null && in.floor() == null && in.active() == null) throw new BadRequestException("Nothing to change");
        List<Room> out = new ArrayList<>();
        for (UUID id : in.roomIds().stream().distinct().toList()) {
            Room room = room(id);
            out.add(updateRoom(id, new RoomInput(in.roomTypeId() == null ? room.roomTypeId() : in.roomTypeId(),
                    room.number(), in.floor() == null ? room.floor() : in.floor(),
                    in.active() == null ? room.active() : in.active(), room.building(),
                    room.name(), room.bedType(), room.description()), userId));
        }
        return out;
    }

    /**
     * Whether a room can be taken out of use: not while somebody is in it or booked into it.
     *
     * <p>A room is never deleted — it is the thing a stay, a folio and a receipt point at, and history that
     * says "room 101" must go on saying it. Deactivating is as far as it goes, and even that waits until the
     * bookings are dealt with, because a guest arriving on Friday to a room that has quietly left the
     * inventory is the desk's problem, not the database's.
     */
    private void refuseIfBooked(Room room) {
        int bookings = jdbc.sql("""
                select count(*) from booking_units bu join bookings bk on bk.id = bu.booking_id
                where bu.room_id = ? and bu.property_id = ? and bu.cancelled_at is null
                  and bk.state::text in ('pending', 'reserved', 'checked_in') and bu.depart_at > now()""")
                .params(room.id(), TenantContext.require()).query(Integer.class).single();
        if (bookings > 0) throw new BadRequestException("Room " + room.number() + " has " + bookings
                + " current or future booking(s). Move or cancel them before taking it out of use.");
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
                occupancy.get(id), rs.getString("name"), rs.getString("bed_type"), rs.getString("description"));
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }

    private static String cap(String s, int max) {
        String t = nz(s);
        return t.length() <= max ? t : t.substring(0, max);
    }

    /** A room number: required, short, and without the spaces that make "101 " a second room 101. */
    private static String number(String raw) {
        String number = nz(raw).replaceAll("\\s+", " ");
        if (number.isEmpty()) throw new BadRequestException("Room number is required");
        if (number.length() > 12) throw new BadRequestException("A room number can be at most 12 characters");
        return number;
    }
}
