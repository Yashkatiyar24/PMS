package in.pms.reports;

import in.pms.common.BadRequestException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Every report the owner asks for, over any range of days: occupancy, revenue, ADR and RevPAR, bookings,
 * cancellations and no-shows, payments, what is owed, expenses, GST, housekeeping, maintenance, guests and where
 * bookings came from. Days are the property's own calendar days.
 *
 * <p>Revenue and nights sold come from the bills (what was charged), not from the rate card, so a discount or a
 * day-use stay counts as it was billed. Available nights are the units on sale today times the days in the range.
 */
@Service
public class PeriodReportService {
    private final JdbcClient jdbc;

    public PeriodReportService(@Qualifier("jdbc") JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public Map<String, Object> report(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) throw new BadRequestException("Check the dates");
        if (ChronoUnit.DAYS.between(from, to) > 400) throw new BadRequestException("Pick at most about a year at a time");
        UUID p = TenantContext.require();
        ZoneId zone = ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(p).query(String.class).single());
        OffsetDateTime start = from.atStartOfDay(zone).toOffsetDateTime(), end = to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        long days = ChronoUnit.DAYS.between(from, to) + 1;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from.toString());
        out.put("to", to.toString());
        out.put("days", days);

        // Occupancy, ADR, RevPAR: from the room lines on the bills.
        long units = num(jdbc.sql("select count(*) from rooms r left join beds b on b.room_id = r.id and b.active where r.property_id = ? and r.active and r.status not in ('blocked', 'maintenance')")
                .param(p).query(Long.class).single());
        var rooms = jdbc.sql("""
                select coalesce(sum(qty), 0) as nights, coalesce(sum(unit_paise * qty), 0) as revenue
                from folio_lines where property_id = ? and kind in ('room_charge', 'day_use') and line_date between ? and ?""")
                .params(p, from, to).query().singleRow();
        long nights = num(rooms.get("nights")), roomRevenue = num(rooms.get("revenue")), available = units * days;
        out.put("occupancy", Map.of("units", units, "availableNights", available, "nightsSold", nights, "occupancyPct", pct(nights, available),
                "roomRevenuePaise", roomRevenue, "adrPaise", nights == 0 ? 0 : Math.round((double) roomRevenue / nights),
                "revparPaise", available == 0 ? 0 : Math.round((double) roomRevenue / available)));

        // Revenue by what it was for: rooms, each kind of extra, discounts, and restaurant sales at the counter.
        List<Map<String, Object>> revenue = new ArrayList<>(jdbc.sql("""
                select coalesce(case when kind in ('room_charge', 'day_use') then 'room' when kind = 'extra' then coalesce(category, 'other') else kind::text end, 'other') as item,
                       sum(unit_paise * qty) as taxable, sum(cgst_paise + sgst_paise + igst_paise) as tax
                from folio_lines where property_id = ? and line_date between ? and ? and kind in ('room_charge','day_use','extra','discount','forfeit','adjustment')
                group by 1 order by 2 desc""").params(p, from, to).query().listOfRows());
        var counter = jdbc.sql("select coalesce(sum(taxable_paise), 0) as taxable, coalesce(sum(cgst_paise + sgst_paise), 0) as tax from pos_orders where property_id = ? and status = 'paid' and closed_at >= ? and closed_at < ?")
                .params(p, start, end).query().singleRow();
        if (num(counter.get("taxable")) != 0) revenue.add(Map.of("item", "restaurant_counter", "taxable", counter.get("taxable"), "tax", counter.get("tax")));
        long revenueTotal = revenue.stream().mapToLong(r -> num(r.get("taxable"))).sum();
        out.put("revenue", Map.of("lines", revenue, "totalPaise", revenueTotal, "taxPaise", revenue.stream().mapToLong(r -> num(r.get("tax"))).sum()));

        // GST by rate, for the return: bills plus counter sales.
        out.put("tax", jdbc.sql("""
                select tax_rate_bp, sum(taxable) as taxable, sum(cgst) as cgst, sum(sgst) as sgst, sum(igst) as igst from (
                  select tax_rate_bp, unit_paise * qty as taxable, cgst_paise as cgst, sgst_paise as sgst, igst_paise as igst from folio_lines
                  where property_id = ? and line_date between ? and ? and kind in ('room_charge','day_use','extra','discount','forfeit','adjustment')
                  union all
                  select tax_rate_bp, taxable_paise, cgst_paise, sgst_paise, 0 from pos_orders where property_id = ? and status = 'paid' and closed_at >= ? and closed_at < ?) t
                group by tax_rate_bp order by tax_rate_bp""").params(p, from, to, p, start, end).query().listOfRows());

        // Bookings: made in the range, and what happened to stays in it.
        out.put("bookings", Map.of(
                "made", count("select count(*) from bookings where property_id = ? and created_at >= ? and created_at < ?", p, start, end),
                "arrivals", count("select count(*) from bookings where property_id = ? and checked_in_at >= ? and checked_in_at < ?", p, start, end),
                "departures", count("select count(*) from bookings where property_id = ? and checked_out_at >= ? and checked_out_at < ?", p, start, end),
                "cancellations", count("select count(*) from bookings where property_id = ? and state = 'cancelled' and updated_at >= ? and updated_at < ?", p, start, end),
                "noShows", count("select count(*) from bookings where property_id = ? and state = 'no_show' and updated_at >= ? and updated_at < ?", p, start, end)));

        // Where bookings came from: count, nights and billed room revenue of stays that started in the range.
        out.put("sources", jdbc.sql("""
                select b.source::text as source, count(*) as bookings,
                       coalesce(sum((select coalesce(sum(qty), 0) from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = b.id and l.kind in ('room_charge', 'day_use'))), 0) as nights,
                       coalesce(sum(f.total_paise), 0) as billed
                from bookings b left join folios f on f.booking_id = b.id
                where b.property_id = ? and b.arrive_at >= ? and b.arrive_at < ? and b.state not in ('cancelled')
                group by b.source order by 2 desc""").params(p, start, end).query().listOfRows());

        // Money in and out.
        out.put("payments", jdbc.sql("""
                select mode::text as mode, coalesce(sum(amount_paise) filter (where not is_refund), 0) as received,
                       coalesce(sum(-amount_paise) filter (where is_refund), 0) as refunded, count(*) as count
                from payments where property_id = ? and received_at >= ? and received_at < ? group by mode order by mode""").params(p, start, end).query().listOfRows());
        var owed = jdbc.sql("""
                select count(*) as count, coalesce(sum(total_paise + deposit_held_paise - paid_paise), 0) as amount
                from folios where property_id = ? and status = 'open' and total_paise + deposit_held_paise - paid_paise > 0""").param(p).query().singleRow();
        out.put("outstanding", Map.of("count", num(owed.get("count")), "amountPaise", num(owed.get("amount"))));
        var spent = jdbc.sql("select category, sum(amount_paise) as amount from expenses where property_id = ? and voided_at is null and spent_on between ? and ? group by category order by 2 desc")
                .params(p, from, to).query().listOfRows();
        long expenses = spent.stream().mapToLong(r -> num(r.get("amount"))).sum();
        out.put("expenses", Map.of("byCategory", spent, "totalPaise", expenses));
        out.put("net", Map.of("revenuePaise", revenueTotal, "expensesPaise", expenses, "netPaise", revenueTotal - expenses));

        // Housekeeping: rooms as they stand, and cleanings finished in the range and by whom (from the audit trail).
        out.put("housekeeping", Map.of(
                "status", jdbc.sql("select status::text as status, count(*) as rooms from rooms where property_id = ? and active group by status order by status").param(p).query().listOfRows(),
                "cleaned", jdbc.sql("""
                        select coalesce(u.name, 'unknown') as name, count(*) as rooms from audit_log a left join users u on u.id = a.user_id
                        where a.property_id = ? and a.table_name = 'rooms' and a.action = 'status' and a.after->>'status' in ('clean', 'inspected') and a.at >= ? and a.at < ?
                        group by u.name order by 2 desc""").params(p, start, end).query().listOfRows()));

        // Maintenance: opened, resolved, how long it took, and what is still open.
        var repairs = jdbc.sql("""
                select count(*) filter (where created_at >= ? and created_at < ?) as opened,
                       count(*) filter (where resolved_at >= ? and resolved_at < ?) as resolved,
                       coalesce(round(avg(extract(epoch from resolved_at - created_at) / 3600) filter (where resolved_at >= ? and resolved_at < ?)), 0) as avg_hours,
                       count(*) filter (where status not in ('resolved', 'closed')) as open_now,
                       count(*) filter (where status not in ('resolved', 'closed') and priority in ('high', 'urgent')) as urgent_now
                from maintenance_tickets where property_id = ?""").params(start, end, start, end, start, end, p).query().singleRow();
        out.put("maintenance", repairs);

        // Guests: who stayed in the range, most nights first.
        out.put("guests", jdbc.sql("""
                select g.id, g.name, g.phone, g.city, count(distinct b.id) as stays,
                       coalesce(sum((select coalesce(sum(qty), 0) from folio_lines l where l.folio_id = f.id and l.kind in ('room_charge', 'day_use'))), 0) as nights,
                       coalesce(sum(f.paid_paise), 0) as paid
                from bookings b join guests g on g.id = b.guest_id left join folios f on f.booking_id = b.id
                where b.property_id = ? and b.state in ('checked_in', 'checked_out') and b.arrive_at < ? and b.depart_at > ?
                group by g.id order by nights desc, paid desc limit 50""").params(p, end, start).query().listOfRows());
        return out;
    }

    private int count(String sql, UUID p, OffsetDateTime start, OffsetDateTime end) { return jdbc.sql(sql).params(p, start, end).query(Integer.class).single(); }
    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
    private static double pct(long part, long whole) { return whole == 0 ? 0 : Math.round(part * 1000.0 / whole) / 10.0; }
}
