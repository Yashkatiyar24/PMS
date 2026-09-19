package in.pms.reports;

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
 * Reports (PRD R1–R5).
 *
 * <p>A <b>business day</b> runs from {@code business_day_start} to the same hour next day, so a 23:00 arrival
 * belongs to the day that is open when it happens and the evening report matches the cash box.
 */
@Service
public class ReportService {
    private final JdbcClient jdbc;
    private final SettingsService settings;

    public ReportService(@Qualifier("jdbc") JdbcClient jdbc, SettingsService settings) { this.jdbc = jdbc; this.settings = settings; }

    public record Window(LocalDate businessDate, OffsetDateTime from, OffsetDateTime to) {}

    /** The business day containing {@code businessDate}; with null, the one that is open now. */
    public Window businessDay(LocalDate businessDate, ZoneId zone) {
        Settings s = settings.current();
        LocalTime start = s.businessDayStart();
        LocalDate date = businessDate != null ? businessDate : currentBusinessDate(zone, start);
        ZonedDateTime from = date.atTime(start).atZone(zone);
        return new Window(date, from.toOffsetDateTime(), from.plusDays(1).toOffsetDateTime());
    }

    private static LocalDate currentBusinessDate(ZoneId zone, LocalTime start) {
        ZonedDateTime now = ZonedDateTime.now(zone);
        return now.toLocalTime().isBefore(start) ? now.toLocalDate().minusDays(1) : now.toLocalDate();
    }

    /** Everything the evening WhatsApp message and the in-app daily screen show (R1). */
    @Transactional(readOnly = true)
    public Map<String, Object> daily(LocalDate businessDate) {
        ZoneId zone = zone();
        Window w = businessDay(businessDate, zone);
        UUID p = TenantContext.require();

        var collections = jdbc.sql("""
                select mode::text as mode, sum(amount_paise) as amount, count(*) as count
                from payments where property_id = ? and received_at >= ? and received_at < ?
                group by mode order by mode""").params(p, w.from(), w.to()).query().listOfRows();
        long collected = collections.stream().mapToLong(r -> ((Number) r.get("amount")).longValue()).sum();

        var cashByUser = jdbc.sql("""
                select coalesce(u.name, 'unknown') as name, sum(p.amount_paise) as amount
                from payments p left join users u on u.id = p.received_by
                where p.property_id = ? and p.received_at >= ? and p.received_at < ? and p.mode = 'cash'
                group by u.name order by u.name""").params(p, w.from(), w.to()).query().listOfRows();

        int arrivals = count("select count(*) from bookings where property_id = ? and checked_in_at >= ? and checked_in_at < ?", p, w);
        int departures = count("select count(*) from bookings where property_id = ? and checked_out_at >= ? and checked_out_at < ?", p, w);
        int noShows = count("select count(*) from bookings where property_id = ? and state = 'no_show' and updated_at >= ? and updated_at < ?", p, w);

        // Occupancy counts the units that were used at any point in the business day, each once even if two
        // stays passed through it. Sampling a single instant instead would depend on when the report is
        // asked for: the start misses everyone who arrived during the day, and the end misses the one-night
        // guests who have already left, who are most of them.
        var occupancy = jdbc.sql("""
                select
                  (select count(*) from rooms r
                     left join beds b on b.room_id = r.id and b.active
                   where r.property_id = ? and r.active and r.status not in ('blocked', 'maintenance')) as sellable,
                  (select count(distinct coalesce(bu.bed_id, bu.room_id)) from booking_units bu
                     where bu.property_id = ? and bu.cancelled_at is null
                       and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)')) as occupied""")
                .params(p, p, w.from(), w.to()).query().listOfRows().get(0);
        long sellable = ((Number) occupancy.get("sellable")).longValue();
        long occupied = ((Number) occupancy.get("occupied")).longValue();

        var outstanding = jdbc.sql("""
                select count(*) as count, coalesce(sum(total_paise + deposit_held_paise - paid_paise), 0) as amount
                from folios where property_id = ? and status = 'open' and total_paise + deposit_held_paise - paid_paise > 0""")
                .param(p).query().listOfRows().get(0);
        long deposits = jdbc.sql("select coalesce(sum(deposit_held_paise), 0) from folios where property_id = ? and status = 'open'").param(p).query(Long.class).single();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("businessDate", w.businessDate().toString());
        out.put("from", w.from().toString());
        out.put("to", w.to().toString());
        out.put("collections", collections);
        out.put("collectedPaise", collected);
        out.put("cashByUser", cashByUser);
        out.put("arrivals", arrivals);
        out.put("departures", departures);
        out.put("noShows", noShows);
        out.put("occupiedUnits", occupied);
        out.put("sellableUnits", sellable);
        out.put("occupancyPct", sellable == 0 ? 0 : Math.round(occupied * 100.0 / sellable));
        out.put("outstandingCount", ((Number) outstanding.get("count")).longValue());
        out.put("outstandingPaise", ((Number) outstanding.get("amount")).longValue());
        out.put("depositsHeldPaise", deposits);
        return out;
    }

    /**
     * The coming nights as booked right now: how full, how many room nights, and what they earn before tax.
     *
     * <p>ADR is revenue per night sold; RevPAR is revenue per night available, the one figure that moves with
     * both price and occupancy. Revenue is each unit's booked rate, so an OTA stay (rate 0 until the desk fills
     * it in) sells a night without earning one. Units blocked today count as not for sale for the whole window.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> forecast(LocalDate start, int days) {
        UUID p = TenantContext.require();
        ZoneId zone = zone();
        LocalDate from = start == null ? LocalDate.now(zone) : start;
        int span = Math.max(1, Math.min(90, days));
        long units = jdbc.sql("select count(*) from rooms r left join beds b on b.room_id = r.id and b.active where r.property_id = ? and r.active and r.status not in ('blocked', 'maintenance')")
                .param(p).query(Long.class).single();

        List<Map<String, Object>> nights = new ArrayList<>();
        long sold = 0, revenue = 0;
        for (var row : jdbc.sql("""
                with nights as (select generate_series(?::date, ?::date, interval '1 day')::date as night),
                     stays as (
                       select bu.rate_paise, (bu.arrive_at at time zone ?)::date as first_night,
                              greatest((bu.depart_at at time zone ?)::date, (bu.arrive_at at time zone ?)::date + 1) as leaves
                       from booking_units bu join bookings b on b.id = bu.booking_id
                       where bu.property_id = ? and bu.cancelled_at is null and b.state in ('reserved', 'checked_in', 'checked_out'))
                select n.night, count(s.first_night) as sold, coalesce(sum(s.rate_paise), 0) as revenue
                from nights n left join stays s on s.first_night <= n.night and n.night < s.leaves
                group by n.night order by n.night""")
                .params(from, from.plusDays(span - 1), zone.getId(), zone.getId(), zone.getId(), p).query().listOfRows()) {
            long nightSold = ((Number) row.get("sold")).longValue(), nightRevenue = ((Number) row.get("revenue")).longValue();
            sold += nightSold;
            revenue += nightRevenue;
            Map<String, Object> night = new LinkedHashMap<>();
            night.put("date", String.valueOf(row.get("night")));
            night.put("sold", nightSold);
            night.put("revenuePaise", nightRevenue);
            night.put("occupancyPct", percent(nightSold, units));
            nights.add(night);
        }
        long available = units * span;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from.toString());
        out.put("to", from.plusDays(span - 1).toString());
        out.put("units", units);
        out.put("roomNights", sold);
        out.put("occupancyPct", percent(sold, available));
        out.put("adrPaise", sold == 0 ? 0 : Math.round((double) revenue / sold));
        out.put("revparPaise", available == 0 ? 0 : Math.round((double) revenue / available));
        out.put("revenuePaise", revenue);
        out.put("nights", nights);
        return out;
    }

    /** One decimal place: 22.2, not 22. */
    private static double percent(long part, long whole) { return whole == 0 ? 0 : Math.round(part * 1000.0 / whole) / 10.0; }

    /** Month summary for the CA: taxable value and CGST/SGST by rate, so GSTR-1 can be filed from it (R3). */
    @Transactional(readOnly = true)
    public Map<String, Object> month(YearMonth month) {
        UUID p = TenantContext.require();
        ZoneId zone = zone();
        LocalDate from = month.atDay(1), to = month.atEndOfMonth();
        OffsetDateTime fromTs = from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime toTs = to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();

        // Bills, and restaurant sales paid at the counter (those are on no bill; room-posted ones are, as a line).
        var byRate = jdbc.sql("""
                select tax_rate_bp, sum(taxable) as taxable, sum(cgst) as cgst, sum(sgst) as sgst, sum(igst) as igst from (
                  select tax_rate_bp, unit_paise * qty as taxable, cgst_paise as cgst, sgst_paise as sgst, igst_paise as igst
                  from folio_lines where property_id = ? and line_date between ? and ?
                    and kind in ('room_charge','day_use','extra','discount','forfeit','adjustment')
                  union all
                  select tax_rate_bp, taxable_paise, cgst_paise, sgst_paise, 0
                  from pos_orders where property_id = ? and status = 'paid' and closed_at >= ? and closed_at < ?) lines
                group by tax_rate_bp order by tax_rate_bp""").params(p, from, to, p, fromTs, toTs).query().listOfRows();

        var payments = jdbc.sql("""
                select mode::text as mode,
                       coalesce(sum(amount_paise) filter (where not is_refund), 0) as received,
                       coalesce(sum(-amount_paise) filter (where is_refund), 0) as refunded
                from payments where property_id = ? and received_at >= ? and received_at < ?
                group by mode order by mode""").params(p, fromTs, toTs).query().listOfRows();

        long nightsSold = jdbc.sql("""
                select coalesce(sum(qty), 0) from folio_lines
                where property_id = ? and line_date between ? and ? and kind in ('room_charge','day_use')""")
                .params(p, from, to).query(Long.class).single();

        var creditNotes = jdbc.sql("""
                select count(*) as count, coalesce(sum(amount_paise), 0) as amount
                from receipts where property_id = ? and kind = 'credit_note' and issued_at >= ? and issued_at < ?""")
                .params(p, fromTs, toTs).query().listOfRows().get(0);

        long revenue = byRate.stream().mapToLong(r -> ((Number) r.get("taxable")).longValue()).sum();
        long tax = byRate.stream().mapToLong(r -> ((Number) r.get("cgst")).longValue() + ((Number) r.get("sgst")).longValue() + ((Number) r.get("igst")).longValue()).sum();
        long units = jdbc.sql("select count(*) from rooms r left join beds b on b.room_id = r.id and b.active where r.property_id = ? and r.active").param(p).query(Long.class).single();
        long sellableNights = units * to.getDayOfMonth();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", month.toString());
        out.put("taxableByRate", byRate);
        out.put("revenuePaise", revenue);
        out.put("taxPaise", tax);
        out.put("nightsSold", nightsSold);
        out.put("occupancyPct", sellableNights == 0 ? 0 : Math.round(nightsSold * 100.0 / sellableNights));
        out.put("payments", payments);
        out.put("creditNotes", creditNotes);
        return out;
    }

    /** Folios with money still owed (R4). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> outstanding() {
        return jdbc.sql("""
                select f.id as folio_id, b.id as booking_id, g.name as guest_name, g.phone, b.state::text as state,
                       b.arrive_at, b.depart_at, f.total_paise + f.deposit_held_paise - f.paid_paise as due_paise
                from folios f join bookings b on b.id = f.booking_id join guests g on g.id = b.guest_id
                where f.property_id = ? and f.status = 'open' and f.total_paise + f.deposit_held_paise - f.paid_paise > 0
                order by b.arrive_at""").param(TenantContext.require()).query().listOfRows();
    }

    /** Cash each user holds since their last handover (R5). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> cashInHand() {
        return jdbc.sql("""
                select u.id as user_id, u.name,
                       coalesce(sum(p.amount_paise), 0) as cash_paise,
                       (select max(h.at) from cash_handovers h where h.user_id = u.id and h.property_id = pu.property_id) as last_handover_at
                from property_users pu
                join users u on u.id = pu.user_id
                left join payments p on p.received_by = u.id and p.property_id = pu.property_id and p.mode = 'cash' and p.handover_id is null
                where pu.property_id = ? and pu.active
                group by u.id, u.name, pu.property_id order by u.name""").param(TenantContext.require()).query().listOfRows();
    }

    /** Close a user's cash: snapshot the amount and mark those payments handed over. */
    @Transactional
    public Map<String, Object> handOverCash(UUID userId, UUID countedBy, String notes) {
        UUID p = TenantContext.require();
        long amount = jdbc.sql("select coalesce(sum(amount_paise), 0) from payments where property_id = ? and received_by = ? and mode = 'cash' and handover_id is null")
                .params(p, userId).query(Long.class).single();
        UUID id = jdbc.sql("insert into cash_handovers(property_id, user_id, amount_paise, counted_by, notes) values (?, ?, ?, ?, ?) returning id")
                .params(p, userId, amount, countedBy, notes == null ? "" : notes).query(UUID.class).single();
        jdbc.sql("update payments set handover_id = ? where property_id = ? and received_by = ? and mode = 'cash' and handover_id is null").params(id, p, userId).update();
        return Map.of("handoverId", id, "amountPaise", amount, "amount", Money.format(amount));
    }

    /** Police guest register for a date range; columns and order come from {@code register_template} (R2). */
    @Transactional(readOnly = true)
    public Map<String, Object> policeRegister(LocalDate from, LocalDate to) {
        ZoneId zone = zone();
        OffsetDateTime fromTs = from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime toTs = to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        var rows = jdbc.sql("""
                select b.id, g.name, g.address, g.city, g.nationality, g.id_type::text as id_type, g.id_last4, g.phone,
                       b.arrive_at, b.depart_at, b.adults, b.children, b.purpose,
                       (select string_agg(r.number || case when bu.bed_id is not null then '/' || bd.label else '' end, ', ')
                          from booking_units bu join rooms r on r.id = bu.room_id left join beds bd on bd.id = bu.bed_id
                         where bu.booking_id = b.id and bu.cancelled_at is null) as units,
                       (select string_agg(m.name, ', ') from booking_members m where m.booking_id = b.id) as members
                from bookings b join guests g on g.id = b.guest_id
                where b.property_id = ? and b.arrive_at >= ? and b.arrive_at < ? and b.state <> 'cancelled'
                order by b.arrive_at""").params(TenantContext.require(), fromTs, toTs).query().listOfRows();
        return Map.of("from", from.toString(), "to", to.toString(), "columns", settings.current().registerTemplate(), "rows", rows);
    }

    private int count(String sql, UUID p, Window w) { return jdbc.sql(sql).params(p, w.from(), w.to()).query(Integer.class).single(); }

    private ZoneId zone() { return ZoneId.of(jdbc.sql("select timezone from properties where id = ?").param(TenantContext.require()).query(String.class).single()); }
}
