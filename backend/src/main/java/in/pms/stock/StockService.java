package in.pms.stock;

import in.pms.audit.AuditService;
import in.pms.auth.Permissions;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.notifications.Notifier;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * Supplies on the shelf: soap, linen, cleaning liquid, rice. Stock is the sum of movements, never a typed-over
 * number, so every change can be traced and the closing stock of any day worked out. Linen can go to the
 * laundry and come back; what is out at the laundry is counted separately from what is on the shelf.
 */
@Service
public class StockService {
    public static final List<String> CATEGORIES = List.of("cleaning", "linen", "toiletries", "food", "maintenance", "stationery");
    /** How each kind moves stock: the sign the desk's positive quantity takes. Adjustments carry their own sign. */
    private static final Map<String, Integer> SIGN = Map.of("opening", 1, "purchase", 1, "consumption", -1, "to_laundry", -1, "from_laundry", 1);

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final Notifier notifier;

    public StockService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, Notifier notifier) { this.jdbc = jdbc; this.audit = audit; this.notifier = notifier; }

    public record Item(UUID id, String name, String category, String unit, BigDecimal lowStockThreshold, boolean active, BigDecimal onHand, BigDecimal atLaundry, boolean low) {}
    public record ItemInput(String name, String category, String unit, BigDecimal lowStockThreshold, Boolean active) {}
    public record MovementInput(String kind, BigDecimal qty, Long unitCostPaise, UUID roomId, String note) {}
    public record Movement(UUID id, String kind, BigDecimal qtyChange, Long unitCostPaise, String roomNumber, String note, String byName, OffsetDateTime at) {}

    private static final String ITEMS = """
            select i.*, coalesce(sum(m.qty_change), 0) as on_hand,
                   -coalesce(sum(m.qty_change) filter (where m.kind in ('to_laundry', 'from_laundry')), 0) as at_laundry
            from inventory_items i left join inventory_movements m on m.item_id = i.id""";

    @Transactional(readOnly = true)
    public List<Item> items() {
        return jdbc.sql(ITEMS + " where i.property_id = ? group by i.id order by i.active desc, i.category, i.name").param(TenantContext.require()).query(this::map).list();
    }

    @Transactional
    public Item createItem(ItemInput in, UUID userId) {
        validate(in);
        try {
            UUID id = jdbc.sql("insert into inventory_items(property_id, name, category, unit, low_stock_threshold) values (?, ?, ?, ?, ?) returning id")
                    .params(TenantContext.require(), in.name().trim(), in.category(), unit(in.unit()), threshold(in.lowStockThreshold())).query(UUID.class).single();
            Item item = item(id);
            audit.record("inventory_items", id.toString(), "create", null, item, userId);
            return item;
        } catch (DuplicateKeyException e) { throw new ConflictException("There is already an item with that name"); }
    }

    @Transactional
    public Item updateItem(UUID id, ItemInput in, UUID userId) {
        validate(in);
        Item before = item(id);
        try {
            jdbc.sql("update inventory_items set name = ?, category = ?, unit = ?, low_stock_threshold = ?, active = ? where id = ? and property_id = ?")
                    .params(in.name().trim(), in.category(), unit(in.unit()), threshold(in.lowStockThreshold()), in.active() == null || in.active(), id, TenantContext.require()).update();
        } catch (DuplicateKeyException e) { throw new ConflictException("There is already an item with that name"); }
        Item after = item(id);
        audit.record("inventory_items", id.toString(), "update", before, after, userId);
        return after;
    }

    /**
     * Stock in, out, to the laundry or back. The quantity the desk types is always positive; the kind says which
     * way it goes (an adjustment is typed with its sign, e.g. -2 for two torn towels). Stock cannot go below zero,
     * and dropping to the low-stock line tells whoever looks after supplies.
     */
    @Transactional
    public Item move(UUID itemId, MovementInput in, UUID userId) {
        // One movement at a time per item, so two people taking the last three soaps cannot both succeed.
        jdbc.sql("select id from inventory_items where id = ? and property_id = ? for update").params(itemId, TenantContext.require()).query(UUID.class).optional()
                .orElseThrow(() -> new NotFoundException("Item"));
        Item before = item(itemId);
        if (in.qty() == null || in.qty().signum() == 0) throw new BadRequestException("Enter a quantity");
        String kind = in.kind() == null ? "" : in.kind();
        BigDecimal change;
        if ("adjustment".equals(kind)) change = in.qty();
        else if (SIGN.containsKey(kind)) {
            if (in.qty().signum() < 0) throw new BadRequestException("Enter a positive quantity; the kind says which way it goes");
            change = in.qty().multiply(BigDecimal.valueOf(SIGN.get(kind)));
        } else throw new BadRequestException("Kind must be one of opening, purchase, consumption, adjustment, to_laundry, from_laundry");
        if (("to_laundry".equals(kind) || "from_laundry".equals(kind)) && !"linen".equals(before.category())) throw new BadRequestException("Only linen goes to the laundry");
        if ("from_laundry".equals(kind) && in.qty().compareTo(before.atLaundry()) > 0) throw new BadRequestException("Only " + before.atLaundry().stripTrailingZeros().toPlainString() + " are at the laundry");
        if (before.onHand().add(change).signum() < 0) throw new BadRequestException("Only " + before.onHand().stripTrailingZeros().toPlainString() + " in stock");
        if (in.unitCostPaise() != null && in.unitCostPaise() < 0) throw new BadRequestException("A cost cannot be negative");
        // A foreign key does not see row-level security, so the room is checked to be this property's.
        if (in.roomId() != null && jdbc.sql("select count(*) from rooms where id = ? and property_id = ?").params(in.roomId(), TenantContext.require()).query(Integer.class).single() == 0)
            throw new NotFoundException("Room");

        UUID id = jdbc.sql("insert into inventory_movements(property_id, item_id, kind, qty_change, unit_cost_paise, room_id, note, created_by) values (?, ?, ?, ?, ?, ?, ?, ?) returning id")
                .params(TenantContext.require(), itemId, kind, change, in.unitCostPaise(), in.roomId(), in.note() == null ? "" : in.note().trim(), userId).query(UUID.class).single();
        Item after = item(itemId);
        audit.record("inventory_movements", id.toString(), kind, Map.of("onHand", before.onHand()), Map.of("onHand", after.onHand(), "change", change), userId);
        if (after.low() && !before.low())
            notifier.notify("low_stock", "Low stock: " + after.name(), after.onHand().stripTrailingZeros().toPlainString() + " " + after.unit() + " left", "/inventory", Permissions.INVENTORY);
        return after;
    }

    @Transactional(readOnly = true)
    public List<Movement> movements(UUID itemId) {
        item(itemId);
        return jdbc.sql("""
                select m.*, r.number as room_number, u.name as by_name from inventory_movements m
                left join rooms r on r.id = m.room_id left join users u on u.id = m.created_by
                where m.item_id = ? and m.property_id = ? order by m.created_at desc limit 200""")
                .params(itemId, TenantContext.require())
                .query((rs, i) -> new Movement(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getBigDecimal("qty_change"),
                        rs.getObject("unit_cost_paise") == null ? null : rs.getLong("unit_cost_paise"), rs.getString("room_number"), rs.getString("note"),
                        rs.getString("by_name"), rs.getObject("created_at", OffsetDateTime.class))).list();
    }

    public record PeriodRow(UUID itemId, String name, String category, String unit, BigDecimal opening, BigDecimal purchases, BigDecimal consumption,
                            BigDecimal adjustments, BigDecimal laundry, BigDecimal closing, long purchaseCostPaise) {}

    /** Opening, purchases, consumption, adjustments and closing stock of every item over a period, in the property's days. */
    @Transactional(readOnly = true)
    public List<PeriodRow> period(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw new BadRequestException("Check the dates");
        UUID p = TenantContext.require();
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(p).query(String.class).single());
        OffsetDateTime start = from.atStartOfDay(zone).toOffsetDateTime(), end = to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        return jdbc.sql("""
                select i.id, i.name, i.category, i.unit,
                       coalesce(sum(m.qty_change) filter (where m.created_at < ?), 0) as opening,
                       coalesce(sum(m.qty_change) filter (where m.created_at >= ? and m.created_at < ? and m.kind in ('purchase', 'opening')), 0) as purchases,
                       -coalesce(sum(m.qty_change) filter (where m.created_at >= ? and m.created_at < ? and m.kind = 'consumption'), 0) as consumption,
                       coalesce(sum(m.qty_change) filter (where m.created_at >= ? and m.created_at < ? and m.kind = 'adjustment'), 0) as adjustments,
                       coalesce(sum(m.qty_change) filter (where m.created_at >= ? and m.created_at < ? and m.kind in ('to_laundry', 'from_laundry')), 0) as laundry,
                       coalesce(sum(m.qty_change) filter (where m.created_at < ?), 0) as closing,
                       coalesce(sum(round(m.qty_change * m.unit_cost_paise)) filter (where m.created_at >= ? and m.created_at < ? and m.kind = 'purchase'), 0) as cost
                from inventory_items i left join inventory_movements m on m.item_id = i.id
                where i.property_id = ? group by i.id order by i.category, i.name""")
                .params(start, start, end, start, end, start, end, start, end, end, start, end, p)
                .query((rs, i) -> new PeriodRow(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("category"), rs.getString("unit"),
                        rs.getBigDecimal("opening"), rs.getBigDecimal("purchases"), rs.getBigDecimal("consumption"), rs.getBigDecimal("adjustments"),
                        rs.getBigDecimal("laundry"), rs.getBigDecimal("closing"), rs.getLong("cost"))).list();
    }

    private Item item(UUID id) {
        return jdbc.sql(ITEMS + " where i.id = ? and i.property_id = ? group by i.id").params(id, TenantContext.require()).query(this::map).optional()
                .orElseThrow(() -> new NotFoundException("Item"));
    }

    private Item map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        BigDecimal onHand = rs.getBigDecimal("on_hand"), threshold = rs.getBigDecimal("low_stock_threshold");
        boolean active = rs.getBoolean("active");
        return new Item(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("category"), rs.getString("unit"), threshold, active,
                onHand, rs.getBigDecimal("at_laundry"), active && threshold.signum() > 0 && onHand.compareTo(threshold) <= 0);
    }

    private static void validate(ItemInput in) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        if (!CATEGORIES.contains(in.category())) throw new BadRequestException("Category must be one of " + CATEGORIES);
        if (in.lowStockThreshold() != null && in.lowStockThreshold().signum() < 0) throw new BadRequestException("The low-stock line cannot be negative");
    }

    private static String unit(String u) { return u == null || u.isBlank() ? "pcs" : u.trim().length() > 20 ? u.trim().substring(0, 20) : u.trim(); }
    private static BigDecimal threshold(BigDecimal t) { return t == null ? BigDecimal.ZERO : t; }
}
