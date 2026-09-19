package in.pms.maintenance;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.inventory.InventoryService;
import in.pms.notifications.Notifier;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Repair tickets, and lost property. A ticket that takes its room off sale puts the room under maintenance, and
 * resolving the last such ticket hands the room back to housekeeping as dirty, since a repair leaves a mess.
 */
@Service
public class MaintenanceService {
    static final Set<String> PRIORITIES = Set.of("low", "normal", "high", "urgent");
    static final Set<String> STATUSES = Set.of("open", "assigned", "in_progress", "resolved", "closed");
    private static final Set<String> DONE = Set.of("resolved", "closed");

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final InventoryService inventory;
    private final Notifier notifier;

    public MaintenanceService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, InventoryService inventory, Notifier notifier) {
        this.jdbc = jdbc; this.audit = audit; this.inventory = inventory; this.notifier = notifier;
    }

    public record Ticket(UUID id, UUID roomId, String roomNumber, String issue, String description, String priority, String status,
                         UUID assignedTo, String assignedName, String resolution, boolean takesRoomOffSale, String reportedByName,
                         OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime resolvedAt) {}
    public record TicketInput(UUID roomId, String issue, String description, String priority, boolean takesRoomOffSale) {}
    public record TicketUpdate(String status, UUID assignedTo, String priority, String resolution) {}

    private static final String SELECT = """
            select m.*, r.number as room_number, a.name as assigned_name, rb.name as reported_by_name
            from maintenance_tickets m left join rooms r on r.id = m.room_id
            left join users a on a.id = m.assigned_to left join users rb on rb.id = m.reported_by""";

    /** Open work first (urgent before low), then what was finished lately. */
    @Transactional(readOnly = true)
    public List<Ticket> list(boolean includeDone) {
        return jdbc.sql(SELECT + "\n" + """
                 where m.property_id = ? and (? or m.status not in ('resolved', 'closed'))
                 order by m.status in ('resolved', 'closed'), array_position(array['urgent','high','normal','low'], m.priority), m.created_at desc limit 200""")
                .params(TenantContext.require(), includeDone).query(this::map).list();
    }

    @Transactional
    public Ticket create(TicketInput in, UUID userId) {
        if (in.issue() == null || in.issue().isBlank()) throw new BadRequestException("Say what is wrong");
        String priority = in.priority() == null || in.priority().isBlank() ? "normal" : in.priority();
        if (!PRIORITIES.contains(priority)) throw new BadRequestException("Priority must be one of " + PRIORITIES);
        String roomNumber = null;
        if (in.roomId() != null) roomNumber = inventory.room(in.roomId()).number(); // 404 for a room that is not ours
        if (in.takesRoomOffSale() && in.roomId() == null) throw new BadRequestException("Pick the room to take off sale");
        UUID id = jdbc.sql("""
                insert into maintenance_tickets(property_id, room_id, issue, description, priority, takes_room_off_sale, reported_by)
                values (?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), in.roomId(), clip(in.issue(), 200), clip(in.description(), 2000), priority, in.takesRoomOffSale(), userId)
                .query(UUID.class).single();
        if (in.takesRoomOffSale()) inventory.setStatus(in.roomId(), "maintenance", clip(in.issue(), 200), null, userId);
        Ticket t = get(id);
        audit.record("maintenance_tickets", id.toString(), "create", null, t, userId);
        notifier.notify("maintenance", (roomNumber == null ? "" : "Room " + roomNumber + ": ") + t.issue(), t.priority(), "/maintenance", Permissions.MAINTENANCE);
        return t;
    }

    /** Assign, move along, or resolve. Resolving needs a word on what was done. */
    @Transactional
    public Ticket update(UUID id, TicketUpdate in, UUID userId) {
        Ticket before = get(id);
        String status = in.status() == null ? before.status() : in.status();
        if (!STATUSES.contains(status)) throw new BadRequestException("Status must be one of " + STATUSES);
        String priority = in.priority() == null ? before.priority() : in.priority();
        if (!PRIORITIES.contains(priority)) throw new BadRequestException("Priority must be one of " + PRIORITIES);
        UUID assignee = in.assignedTo() != null ? in.assignedTo() : before.assignedTo();
        if (in.assignedTo() != null && technicians().stream().noneMatch(p -> p.id().equals(in.assignedTo())))
            throw new BadRequestException("That person does not handle maintenance here");
        if ("open".equals(status) && assignee != null && in.assignedTo() != null) status = "assigned";
        String resolution = in.resolution() == null ? before.resolution() : in.resolution().trim();
        if (DONE.contains(status) && (resolution == null || resolution.isBlank())) throw new BadRequestException("Say what was done to resolve it");

        boolean finishing = DONE.contains(status) && !DONE.contains(before.status());
        jdbc.sql("""
                update maintenance_tickets set status = ?, priority = ?, assigned_to = ?, resolution = ?, updated_at = now(),
                       resolved_at = case when ? then now() when ? then null else resolved_at end
                where id = ? and property_id = ?""")
                .params(status, priority, assignee, resolution, finishing, !DONE.contains(status), id, TenantContext.require()).update();

        // The last off-sale ticket for a room is done: back to housekeeping, dirty.
        if (finishing && before.takesRoomOffSale() && before.roomId() != null) {
            int stillOpen = jdbc.sql("select count(*) from maintenance_tickets where room_id = ? and property_id = ? and takes_room_off_sale and status not in ('resolved', 'closed')")
                    .params(before.roomId(), TenantContext.require()).query(Integer.class).single();
            if (stillOpen == 0 && "maintenance".equals(inventory.room(before.roomId()).status()))
                inventory.setStatus(before.roomId(), "dirty", null, null, userId);
        }
        Ticket after = get(id);
        audit.record("maintenance_tickets", id.toString(), "update", Map.of("status", before.status(), "priority", before.priority(), "assignedTo", String.valueOf(before.assignedTo())),
                Map.of("status", after.status(), "priority", after.priority(), "assignedTo", String.valueOf(after.assignedTo()), "resolution", String.valueOf(after.resolution())), userId);
        return after;
    }

    /** Active members who handle repairs: who a ticket can be given to. */
    @Transactional(readOnly = true)
    public List<InventoryService.Person> technicians() {
        String[] roles = Permissions.rolesWith(Permissions.MAINTENANCE).toArray(String[]::new);
        return jdbc.sql("""
                select u.id, u.name, pu.role::text as role from property_users pu join users u on u.id = pu.user_id
                where pu.property_id = ? and pu.active and u.active and pu.role::text = any(?) order by u.name""")
                .params(TenantContext.require(), roles).query((rs, i) -> new InventoryService.Person(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("role"))).list();
    }

    @Transactional(readOnly = true)
    public Ticket get(UUID id) {
        return jdbc.sql(SELECT + " where m.id = ? and m.property_id = ?").params(id, TenantContext.require()).query(this::map).optional()
                .orElseThrow(() -> new NotFoundException("Ticket"));
    }

    private Ticket map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Ticket(rs.getObject("id", UUID.class), rs.getObject("room_id", UUID.class), rs.getString("room_number"), rs.getString("issue"), rs.getString("description"),
                rs.getString("priority"), rs.getString("status"), rs.getObject("assigned_to", UUID.class), rs.getString("assigned_name"), rs.getString("resolution"),
                rs.getBoolean("takes_room_off_sale"), rs.getString("reported_by_name"), rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class), rs.getObject("resolved_at", OffsetDateTime.class));
    }

    // ---------- Lost and found ----------

    public record Item(UUID id, UUID roomId, String roomNumber, String description, OffsetDateTime foundAt, String foundByName, String status, String returnedTo, String notes) {}
    public record ItemInput(UUID roomId, String description, String notes) {}
    public record ItemUpdate(String status, String returnedTo, String notes) {}

    @Transactional(readOnly = true)
    public List<Item> items() {
        return jdbc.sql("""
                select l.*, r.number as room_number, u.name as found_by_name from lost_found_items l
                left join rooms r on r.id = l.room_id left join users u on u.id = l.found_by
                where l.property_id = ? order by l.status <> 'held', l.found_at desc limit 200""")
                .param(TenantContext.require()).query(this::mapItem).list();
    }

    @Transactional
    public Item logItem(ItemInput in, UUID userId) {
        if (in.description() == null || in.description().isBlank()) throw new BadRequestException("Describe what was found");
        if (in.roomId() != null) inventory.room(in.roomId());
        UUID id = jdbc.sql("insert into lost_found_items(property_id, room_id, description, found_by, notes) values (?, ?, ?, ?, ?) returning id")
                .params(TenantContext.require(), in.roomId(), clip(in.description(), 300), userId, clip(in.notes(), 1000)).query(UUID.class).single();
        audit.record("lost_found_items", id.toString(), "create", null, Map.of("description", in.description()), userId);
        return item(id);
    }

    /** Handed back (to whom), or disposed of. */
    @Transactional
    public Item updateItem(UUID id, ItemUpdate in, UUID userId) {
        Item before = item(id);
        String status = in.status() == null ? before.status() : in.status();
        if (!Set.of("held", "returned", "disposed").contains(status)) throw new BadRequestException("Status must be held, returned or disposed");
        if ("returned".equals(status) && (in.returnedTo() == null || in.returnedTo().isBlank())) throw new BadRequestException("Say who it was returned to");
        jdbc.sql("update lost_found_items set status = ?, returned_to = ?, notes = ?, updated_at = now() where id = ? and property_id = ?")
                .params(status, "returned".equals(status) ? clip(in.returnedTo(), 200) : null, in.notes() == null ? before.notes() : clip(in.notes(), 1000), id, TenantContext.require()).update();
        audit.record("lost_found_items", id.toString(), "update", Map.of("status", before.status()), Map.of("status", status, "returnedTo", String.valueOf(in.returnedTo())), userId);
        return item(id);
    }

    private Item item(UUID id) {
        return jdbc.sql("""
                select l.*, r.number as room_number, u.name as found_by_name from lost_found_items l
                left join rooms r on r.id = l.room_id left join users u on u.id = l.found_by where l.id = ? and l.property_id = ?""")
                .params(id, TenantContext.require()).query(this::mapItem).optional().orElseThrow(() -> new NotFoundException("Item"));
    }

    private Item mapItem(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Item(rs.getObject("id", UUID.class), rs.getObject("room_id", UUID.class), rs.getString("room_number"), rs.getString("description"),
                rs.getObject("found_at", OffsetDateTime.class), rs.getString("found_by_name"), rs.getString("status"), rs.getString("returned_to"), rs.getString("notes"));
    }

    private static String clip(String s, int max) { String v = s == null ? "" : s.trim(); return v.length() > max ? v.substring(0, max) : v; }
}
