package in.pms.inventory;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Room types, rooms and dormitory beds (PRD P2, P3, H1). All writes are audited. */
@Service
public class InventoryService {
    private static final Pattern RANGE = Pattern.compile("^\\s*(\\d+)\\s*-\\s*(\\d+)\\s*$");
    private final JdbcClient jdbc;
    private final AuditService audit;

    public InventoryService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    // ---------- Room types ----------

    public record RoomTypeInput(String name, long baseRatePaise, int maxOccupancy, long extraPersonPaise, boolean dormitory, int bedCount, int sortOrder, boolean active) {}

    @Transactional(readOnly = true)
    public List<RoomType> roomTypes() {
        return jdbc.sql("select * from room_types where property_id = ? order by sort_order, name").param(TenantContext.require()).query(this::mapRoomType).list();
    }

    @Transactional
    public RoomType createRoomType(RoomTypeInput in, UUID userId) {
        validate(in);
        UUID id = jdbc.sql("""
                insert into room_types(property_id, name, base_rate_paise, max_occupancy, extra_person_paise, is_dormitory, bed_count, sort_order, active)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), in.name().trim(), in.baseRatePaise(), in.maxOccupancy(), in.extraPersonPaise(), in.dormitory(), in.dormitory() ? in.bedCount() : 0, in.sortOrder(), in.active())
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
                update room_types set name = ?, base_rate_paise = ?, max_occupancy = ?, extra_person_paise = ?, bed_count = ?, sort_order = ?, active = ?, updated_at = now()
                where id = ? and property_id = ?""")
                .params(in.name().trim(), in.baseRatePaise(), in.maxOccupancy(), in.extraPersonPaise(), in.dormitory() ? in.bedCount() : 0, in.sortOrder(), in.active(), id, TenantContext.require()).update();
        RoomType after = roomType(id);
        audit.record("room_types", id.toString(), "update", before, after, userId);
        return after;
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
        return new RoomType(rs.getObject("id", UUID.class), rs.getString("name"), rs.getLong("base_rate_paise"), rs.getInt("max_occupancy"),
                rs.getLong("extra_person_paise"), rs.getBoolean("is_dormitory"), rs.getInt("bed_count"), rs.getInt("sort_order"), rs.getBoolean("active"));
    }

    // ---------- Rooms ----------

    public record RoomInput(UUID roomTypeId, String number, int floor, boolean active) {}
    public record BulkRoomsInput(UUID roomTypeId, String range, int floor) {}

    @Transactional(readOnly = true)
    public List<Room> rooms() {
        UUID p = TenantContext.require();
        Map<UUID, List<Room.Bed>> beds = new HashMap<>();
        jdbc.sql("select id, room_id, label, active from beds where property_id = ? order by label").param(p).query(rs -> {
            beds.computeIfAbsent(rs.getObject("room_id", UUID.class), k -> new ArrayList<>()).add(new Room.Bed(rs.getObject("id", UUID.class), rs.getString("label"), rs.getBoolean("active")));
        });
        return jdbc.sql("""
                select r.*, t.name as type_name from rooms r join room_types t on t.id = r.room_type_id
                where r.property_id = ? order by r.floor, r.number""").param(p)
                .query((rs, i) -> room(rs, beds.getOrDefault(rs.getObject("id", UUID.class), List.of()))).list();
    }

    @Transactional
    public Room createRoom(RoomInput in, UUID userId) {
        if (in.number() == null || in.number().isBlank()) throw new BadRequestException("Room number is required");
        RoomType type = roomType(in.roomTypeId());
        UUID id = jdbc.sql("insert into rooms(property_id, room_type_id, number, floor, active) values (?, ?, ?, ?, ?) returning id")
                .params(TenantContext.require(), type.id(), in.number().trim(), in.floor(), in.active()).query(UUID.class).single();
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
            created.add(createRoom(new RoomInput(in.roomTypeId(), String.valueOf(n), in.floor(), true), userId));
        }
        return created;
    }

    @Transactional
    public Room updateRoom(UUID id, RoomInput in, UUID userId) {
        Room before = room(id);
        roomType(in.roomTypeId());
        jdbc.sql("update rooms set room_type_id = ?, number = ?, floor = ?, active = ?, updated_at = now() where id = ? and property_id = ?")
                .params(in.roomTypeId(), in.number().trim(), in.floor(), in.active(), id, TenantContext.require()).update();
        Room after = room(id);
        audit.record("rooms", id.toString(), "update", before, after, userId);
        return after;
    }

    /** Housekeeping status. Blocking needs a reason; clean/dirty flip in one tap (PRD H1, H2). */
    @Transactional
    public Room setStatus(UUID id, String status, String reason, OffsetDateTime until, UUID userId) {
        if (!Set.of("clean", "dirty", "blocked").contains(status)) throw new BadRequestException("Status must be clean, dirty or blocked");
        if ("blocked".equals(status) && (reason == null || reason.isBlank())) throw new BadRequestException("A reason is required to block a room");
        Room before = room(id);
        jdbc.sql("update rooms set status = ?::room_status, blocked_reason = ?, blocked_until = ?, updated_at = now() where id = ? and property_id = ?")
                .params(status, "blocked".equals(status) ? reason : null, "blocked".equals(status) ? until : null, id, TenantContext.require()).update();
        Room after = room(id);
        audit.record("rooms", id.toString(), "status", Map.of("status", before.status()), Map.of("status", status, "reason", reason == null ? "" : reason), userId);
        return after;
    }

    @Transactional(readOnly = true)
    public Room room(UUID id) {
        List<Room.Bed> beds = jdbc.sql("select id, label, active from beds where room_id = ? and property_id = ? order by label").params(id, TenantContext.require())
                .query((rs, i) -> new Room.Bed(rs.getObject("id", UUID.class), rs.getString("label"), rs.getBoolean("active"))).list();
        return jdbc.sql("select r.*, t.name as type_name from rooms r join room_types t on t.id = r.room_type_id where r.id = ? and r.property_id = ?")
                .params(id, TenantContext.require()).query((rs, i) -> room(rs, beds)).optional().orElseThrow(() -> new NotFoundException("Room"));
    }

    private static Room room(java.sql.ResultSet rs, List<Room.Bed> beds) throws java.sql.SQLException {
        return new Room(rs.getObject("id", UUID.class), rs.getObject("room_type_id", UUID.class), rs.getString("type_name"), rs.getString("number"), rs.getInt("floor"),
                rs.getString("status"), rs.getString("blocked_reason"), rs.getObject("blocked_until", OffsetDateTime.class), rs.getBoolean("active"), beds);
    }
}
