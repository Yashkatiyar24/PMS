package in.pms.channels;

import in.pms.booking.Booking;
import in.pms.booking.BookingService;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the property's public booking page reads. The booking itself is {@link BookingService#reserveOnline}.
 *
 * <p>Everything here is shown to strangers, so it carries the property's public face only: name, address,
 * phone, times and room types with their rates. Never a guest, a booking or a room number.
 */
@Service
public class OnlineBookingService {
    private final JdbcClient jdbc;
    private final SettingsService settings;
    private final in.pms.integrations.payments.PaymentGateway gateway;

    public OnlineBookingService(@Qualifier("jdbc") JdbcClient jdbc, SettingsService settings, in.pms.integrations.payments.PaymentGateway gateway) {
        this.jdbc = jdbc; this.settings = settings; this.gateway = gateway;
    }

    /** Whether this property takes payment on its page: its own setting, and only when a gateway is set up at all. */
    public String paymentMode(Settings s) { return gateway.enabled() ? s.onlinePayment() : "off"; }

    /** {@code payment} is off, optional or required: whether the guest pays {@code advancePct}% online when booking. */
    public record Page(String name, String city, String address, String phone, String checkinTime, String checkoutTime,
                       String today, int maxNights, int daysAhead, boolean consentRequired, Map<String, String> consentText,
                       String payment, int advancePct) {}
    public record Offer(UUID roomTypeId, String name, int maxOccupancy, boolean dormitory, long ratePaise, int free, long nights, long totalPaise) {}
    /** {@code status} is reserved, or pending while an online payment is awaited; {@code payment} is how to pay, when there is one. */
    public record Confirmation(String reference, String guestName, String propertyName, String propertyPhone, String roomType,
                               String arrive, String depart, long nights, long totalPaise, String checkinTime,
                               String status, long paidPaise, in.pms.payments.PaymentService.Checkout payment) {
        public Confirmation withPayment(in.pms.payments.PaymentService.Checkout checkout) {
            return new Confirmation(reference, guestName, propertyName, propertyPhone, roomType, arrive, depart, nights, totalPaise, checkinTime, status, paidPaise, checkout);
        }
    }

    @Transactional(readOnly = true)
    public boolean enabled() { return settings.current().onlineBookingEnabled(); }

    @Transactional(readOnly = true)
    public Page page() {
        Settings s = settings.current();
        var p = property();
        return new Page((String) p.get("name"), (String) p.get("city"), (String) p.get("address"), (String) p.get("phone"),
                s.checkinTime().toString(), s.checkoutTime().toString(), LocalDate.now(zone(p)).toString(),
                s.onlineBookingMaxNights(), s.onlineBookingDaysAhead(), s.consentRequired(), s.consentText(), paymentMode(s), s.onlinePaymentAdvancePct());
    }

    /** Each room type with how many units are free for the whole stay, and the price before any tax. */
    @Transactional(readOnly = true)
    public List<Offer> offers(LocalDate arrive, LocalDate depart) {
        Settings s = settings.current();
        ZoneId zone = zone(property());
        BookingService.checkOnlineDates(s, LocalDate.now(zone), arrive, depart);
        OffsetDateTime from = arrive.atTime(s.checkinTime()).atZone(zone).toOffsetDateTime();
        OffsetDateTime to = depart.atTime(s.checkoutTime()).atZone(zone).toOffsetDateTime();
        long nights = ChronoUnit.DAYS.between(arrive, depart);
        return jdbc.sql("""
                select t.id, t.name, t.base_rate_paise, t.max_occupancy, t.is_dormitory,
                       (select count(*) from rooms r left join beds b on b.room_id = r.id and b.active
                         where r.room_type_id = t.id and r.property_id = t.property_id and r.active and r.status not in ('blocked', 'maintenance')
                           and (t.is_dormitory = false or b.id is not null)
                           and not exists (select 1 from booking_units bu where bu.cancelled_at is null
                                             and (coalesce(bu.bed_id, bu.room_id) = coalesce(b.id, r.id) or (b.id is not null and bu.room_id = r.id and bu.bed_id is null))
                                             and tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(?, ?, '[)'))) as free
                from room_types t where t.property_id = ? and t.active order by t.sort_order, t.name""")
                .params(from, to, TenantContext.require())
                .query((rs, i) -> new Offer(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("max_occupancy"), rs.getBoolean("is_dormitory"),
                        rs.getLong("base_rate_paise"), rs.getInt("free"), nights, rs.getLong("base_rate_paise") * nights))
                .list();
    }

    /** What the guest's screen shows after booking: a reference to quote at the desk, and nothing internal. */
    @Transactional(readOnly = true)
    public Confirmation confirmation(Booking b) {
        var p = property();
        ZoneId zone = zone(p);
        String roomType = jdbc.sql("""
                select t.name from booking_units bu join rooms r on r.id = bu.room_id join room_types t on t.id = r.room_type_id
                where bu.booking_id = ? and bu.property_id = ? and bu.cancelled_at is null limit 1""")
                .params(b.id(), TenantContext.require()).query(String.class).optional().orElse("");
        LocalDate arrive = b.arriveAt().atZoneSameInstant(zone).toLocalDate();
        LocalDate depart = b.departAt().atZoneSameInstant(zone).toLocalDate();
        return new Confirmation(reference(b.id()), b.guestName(), (String) p.get("name"), (String) p.get("phone"), roomType,
                arrive.toString(), depart.toString(), ChronoUnit.DAYS.between(arrive, depart), b.totalPaise(),
                settings.current().checkinTime().toString(), b.state(), b.paidPaise(), null);
    }

    /** The first eight characters of the booking id: short enough to read out over the phone. */
    public static String reference(UUID bookingId) {
        return bookingId.toString().substring(0, 8).toUpperCase();
    }

    private Map<String, Object> property() {
        return jdbc.sql("select name, city, address, phone, timezone from properties where id = ?").param(TenantContext.require()).query().singleRow();
    }

    private static ZoneId zone(Map<String, Object> property) { return ZoneId.of((String) property.get("timezone")); }
}
