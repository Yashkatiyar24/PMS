package in.pms.restaurant;

import in.pms.audit.AuditService;
import in.pms.charges.ReceiptNumberFormat;
import in.pms.common.BadRequestException;
import in.pms.common.ConflictException;
import in.pms.common.NotFoundException;
import in.pms.folio.FolioService;
import in.pms.money.FinancialYear;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tax.TaxEngine;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * A light restaurant, not a POS: a menu, orders, and two ways to settle one.
 *
 * <p>Posted to a room, the order becomes one restaurant charge on the guest's bill at the restaurant's GST
 * rate, and the guest pays it with everything else at checkout. Paid at the counter, it takes a payment of its
 * own (so the day's collections and the cash handover count it) and a gap-free bill number.
 */
@Service
public class RestaurantService {
    private final JdbcClient jdbc;
    private final AuditService audit;
    private final SettingsService settings;
    private final FolioService folios;

    public RestaurantService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, SettingsService settings, FolioService folios) {
        this.jdbc = jdbc; this.audit = audit; this.settings = settings; this.folios = folios;
    }

    // ---------- Menu ----------

    public record MenuItem(UUID id, String name, String category, long pricePaise, boolean active, int sortOrder) {}
    public record MenuInput(String name, String category, long pricePaise, Boolean active, Integer sortOrder) {}

    @Transactional(readOnly = true)
    public List<MenuItem> menu() {
        return jdbc.sql("select * from menu_items where property_id = ? order by active desc, category, sort_order, name").param(TenantContext.require())
                .query((rs, i) -> new MenuItem(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("category"), rs.getLong("price_paise"),
                        rs.getBoolean("active"), rs.getInt("sort_order"))).list();
    }

    @Transactional
    public MenuItem saveMenuItem(UUID id, MenuInput in, UUID userId) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        if (in.pricePaise() < 0) throw new BadRequestException("A price cannot be negative");
        UUID p = TenantContext.require();
        String category = in.category() == null ? "" : in.category().trim();
        if (id == null) {
            id = jdbc.sql("insert into menu_items(property_id, name, category, price_paise, sort_order) values (?, ?, ?, ?, ?) returning id")
                    .params(p, in.name().trim(), category, in.pricePaise(), in.sortOrder() == null ? 0 : in.sortOrder()).query(UUID.class).single();
            audit.record("menu_items", id.toString(), "create", null, in, userId);
        } else {
            int n = jdbc.sql("update menu_items set name = ?, category = ?, price_paise = ?, active = ?, sort_order = coalesce(?, sort_order) where id = ? and property_id = ?")
                    .params(in.name().trim(), category, in.pricePaise(), in.active() == null || in.active(), in.sortOrder(), id, p).update();
            if (n == 0) throw new NotFoundException("Menu item");
            audit.record("menu_items", id.toString(), "update", null, in, userId);
        }
        UUID saved = id;
        return menu().stream().filter(m -> m.id().equals(saved)).findFirst().orElseThrow();
    }

    // ---------- Orders ----------

    /** A line the desk adds: a menu item (priced from the menu), or something off the menu with its own price. */
    public record LineInput(UUID menuItemId, String name, Long unitPaise, int qty) {}
    public record OrderInput(UUID bookingId, String tableLabel, List<LineInput> lines) {}
    public record Line(UUID id, UUID menuItemId, String name, int qty, long unitPaise) {}
    public record Order(UUID id, UUID bookingId, String guestName, String units, String tableLabel, String status, long taxablePaise, int taxRateBp,
                        long cgstPaise, long sgstPaise, long totalPaise, String billNumber, String createdByName, OffsetDateTime createdAt,
                        OffsetDateTime closedAt, String cancelReason, List<Line> lines) {}

    @Transactional(readOnly = true)
    public List<Order> orders(boolean openOnly) {
        UUID p = TenantContext.require();
        ZoneId zone = zone();
        OffsetDateTime today = LocalDate.now(zone).atStartOfDay(zone).toOffsetDateTime();
        List<UUID> ids = jdbc.sql("select id from pos_orders where property_id = ? and (status = 'open' or (not ? and created_at >= ?)) order by created_at desc limit 200")
                .params(p, openOnly, today.minusDays(1)).query(UUID.class).list();
        return ids.stream().map(this::get).toList();
    }

    @Transactional
    public Order create(OrderInput in, UUID userId) {
        UUID p = TenantContext.require();
        if (in.bookingId() != null) requireInHouse(in.bookingId());
        UUID id = jdbc.sql("insert into pos_orders(property_id, booking_id, table_label, created_by) values (?, ?, ?, ?) returning id")
                .params(p, in.bookingId(), in.tableLabel() == null ? "" : in.tableLabel().trim(), userId).query(UUID.class).single();
        writeLines(id, in.lines());
        Order order = get(id);
        audit.record("pos_orders", id.toString(), "create", null, Map.of("totalPaise", order.totalPaise(), "lines", order.lines().size()), userId);
        return order;
    }

    /** Change what was ordered while the order is still open. */
    @Transactional
    public Order setLines(UUID id, List<LineInput> lines, UUID userId) {
        Order before = open(id);
        jdbc.sql("delete from pos_order_lines where order_id = ? and property_id = ?").params(id, TenantContext.require()).update();
        writeLines(id, lines);
        Order after = get(id);
        audit.record("pos_orders", id.toString(), "lines", Map.of("totalPaise", before.totalPaise()), Map.of("totalPaise", after.totalPaise()), userId);
        return after;
    }

    /** Charge the order to a guest in the house: one restaurant line on their bill, at the restaurant's GST rate. */
    @Transactional
    public Order postToRoom(UUID id, UUID bookingId, UUID userId) {
        Order order = open(id);
        UUID target = bookingId != null ? bookingId : order.bookingId();
        if (target == null) throw new BadRequestException("Pick the guest's room");
        UUID folioId = requireInHouse(target);
        if (order.lines().isEmpty()) throw new BadRequestException("The order is empty");
        long gross = order.lines().stream().mapToLong(l -> l.unitPaise() * l.qty()).sum();
        String what = "Restaurant #" + id.toString().substring(0, 6).toUpperCase() + (order.tableLabel().isBlank() ? "" : " · " + order.tableLabel());
        UUID lineId = folios.postCharge(folioId, what, "restaurant", gross, order.taxRateBp(), userId);
        jdbc.sql("update pos_orders set status = 'posted', booking_id = ?, folio_line_id = ?, closed_at = now() where id = ? and property_id = ?")
                .params(target, lineId, id, TenantContext.require()).update();
        Order after = get(id);
        audit.record("pos_orders", id.toString(), "post_to_room", null, Map.of("bookingId", target.toString(), "totalPaise", after.totalPaise()), userId);
        return after;
    }

    /** Paid at the counter: a payment of its own, and the next bill number. */
    @Transactional
    public Order pay(UUID id, String mode, String reference, UUID userId) {
        Order order = open(id);
        if (order.lines().isEmpty() || order.totalPaise() <= 0) throw new BadRequestException("The order is empty");
        Settings s = settings.current();
        if (mode == null || !s.paymentModes().contains(mode)) throw new BadRequestException("Payment mode not enabled: " + mode);
        UUID p = TenantContext.require();
        String fy = FinancialYear.of(LocalDate.now(zone()));
        jdbc.sql("insert into receipt_counters(property_id, fy, kind, last) values (?, ?, 'pos_bill', 0) on conflict do nothing").params(p, fy).update();
        int seq = jdbc.sql("update receipt_counters set last = last + 1 where property_id = ? and fy = ? and kind = 'pos_bill' returning last").params(p, fy).query(Integer.class).single();
        String number = ReceiptNumberFormat.format(s.receiptNumberFormat(), s.receiptPrefix() + "B", fy, seq);
        UUID paymentId = jdbc.sql("""
                insert into payments(property_id, pos_order_id, mode, amount_paise, reference, received_by) values (?, ?, ?::payment_mode, ?, ?, ?) returning id""")
                .params(p, id, mode, order.totalPaise(), reference == null ? "" : reference.trim(), userId).query(UUID.class).single();
        jdbc.sql("update pos_orders set status = 'paid', bill_number = ?, closed_at = now() where id = ? and property_id = ?").params(number, id, p).update();
        audit.record("payments", paymentId.toString(), "create", null, Map.of("mode", mode, "amountPaise", order.totalPaise(), "posOrder", id.toString()), userId);
        audit.record("pos_orders", id.toString(), "pay", null, Map.of("billNumber", number), userId);
        return get(id);
    }

    @Transactional
    public Order cancel(UUID id, String reason, UUID userId) {
        if (reason == null || reason.isBlank()) throw new BadRequestException("A reason is required");
        open(id);
        jdbc.sql("update pos_orders set status = 'cancelled', cancel_reason = ?, closed_at = now() where id = ? and property_id = ?").params(reason.trim(), id, TenantContext.require()).update();
        audit.record("pos_orders", id.toString(), "cancel", null, Map.of("reason", reason), userId);
        return get(id);
    }

    @Transactional(readOnly = true)
    public Order get(UUID id) {
        UUID p = TenantContext.require();
        List<Line> lines = jdbc.sql("select * from pos_order_lines where order_id = ? and property_id = ? order by name").params(id, p)
                .query((rs, i) -> new Line(rs.getObject("id", UUID.class), rs.getObject("menu_item_id", UUID.class), rs.getString("name"), rs.getInt("qty"), rs.getLong("unit_paise"))).list();
        return jdbc.sql("""
                select o.*, g.name as guest_name, u.name as created_by_name,
                       (select string_agg(r.number, ', ') from booking_units bu join rooms r on r.id = bu.room_id where bu.booking_id = o.booking_id and bu.cancelled_at is null) as units
                from pos_orders o left join bookings b on b.id = o.booking_id left join guests g on g.id = b.guest_id left join users u on u.id = o.created_by
                where o.id = ? and o.property_id = ?""").params(id, p)
                .query((rs, i) -> new Order(rs.getObject("id", UUID.class), rs.getObject("booking_id", UUID.class), rs.getString("guest_name"), rs.getString("units"),
                        rs.getString("table_label"), rs.getString("status"), rs.getLong("taxable_paise"), rs.getInt("tax_rate_bp"), rs.getLong("cgst_paise"),
                        rs.getLong("sgst_paise"), rs.getLong("total_paise"), rs.getString("bill_number"), rs.getString("created_by_name"),
                        rs.getObject("created_at", OffsetDateTime.class), rs.getObject("closed_at", OffsetDateTime.class), rs.getString("cancel_reason"), lines))
                .optional().orElseThrow(() -> new NotFoundException("Order"));
    }

    // ---------- Internals ----------

    /** The order, locked for the rest of the transaction: two quick taps on Pay settle it once. */
    private Order open(UUID id) {
        jdbc.sql("select id from pos_orders where id = ? and property_id = ? for update").params(id, TenantContext.require()).query(UUID.class).optional()
                .orElseThrow(() -> new NotFoundException("Order"));
        Order order = get(id);
        if (!"open".equals(order.status())) throw new ConflictException("This order is already " + order.status());
        return order;
    }

    /** The folio of a guest who is in the house now; food cannot be charged to a stay that has not started or has ended. */
    private UUID requireInHouse(UUID bookingId) {
        var row = jdbc.sql("select b.state::text as state, f.id as folio_id from bookings b join folios f on f.booking_id = b.id where b.id = ? and b.property_id = ?")
                .params(bookingId, TenantContext.require()).query().listOfRows().stream().findFirst().orElseThrow(() -> new NotFoundException("Booking"));
        if (!"checked_in".equals(row.get("state"))) throw new ConflictException("Only a guest who is staying now can be charged to the room");
        return (UUID) row.get("folio_id");
    }

    /** Lines, then the order's tax and totals from them, through the tax engine like every other charge. */
    private void writeLines(UUID orderId, List<LineInput> lines) {
        UUID p = TenantContext.require();
        Map<UUID, MenuItem> menu = new HashMap<>();
        for (MenuItem m : menu()) menu.put(m.id(), m);
        for (LineInput l : lines == null ? List.<LineInput>of() : lines) {
            if (l.qty() < 1 || l.qty() > 999) throw new BadRequestException("Quantity must be between 1 and 999");
            String name; long unit;
            if (l.menuItemId() != null) {
                MenuItem m = menu.get(l.menuItemId());
                if (m == null || !m.active()) throw new BadRequestException("That dish is not on the menu");
                name = m.name(); unit = m.pricePaise();
            } else {
                if (l.name() == null || l.name().isBlank() || l.unitPaise() == null || l.unitPaise() < 0) throw new BadRequestException("Name and price are needed for an item not on the menu");
                name = l.name().trim(); unit = l.unitPaise();
            }
            jdbc.sql("insert into pos_order_lines(property_id, order_id, menu_item_id, name, qty, unit_paise) values (?, ?, ?, ?, ?, ?)")
                    .params(p, orderId, l.menuItemId(), name, l.qty(), unit).update();
        }
        Settings s = settings.current();
        boolean hasGstin = jdbc.sql("select gstin is not null and gstin <> '' from properties where id = ?").param(p).query(Boolean.class).single();
        int bp = TaxEngine.restaurantRateBp(s, hasGstin);
        long gross = jdbc.sql("select coalesce(sum(qty * unit_paise), 0) from pos_order_lines where order_id = ? and property_id = ?").params(orderId, p).query(Long.class).single();
        TaxEngine.Priced priced = TaxEngine.price(gross, 1, bp, s.ratesIncludeTax(), false);
        jdbc.sql("update pos_orders set taxable_paise = ?, tax_rate_bp = ?, cgst_paise = ?, sgst_paise = ?, total_paise = ? where id = ? and property_id = ?")
                .params(priced.taxablePaise(), bp, priced.tax().cgstPaise(), priced.tax().sgstPaise(), priced.totalPaise(), orderId, p).update();
    }

    private ZoneId zone() { return ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single()); }
}
