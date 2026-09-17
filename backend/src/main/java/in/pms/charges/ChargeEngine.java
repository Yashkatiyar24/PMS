package in.pms.charges;

import in.pms.settings.Settings;

import java.time.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns a stay (arrive, depart, rate) into room-charge lines according to the property's billing rules.
 * Pure: no database, no clock. Every awkward case (arrive 02:00 leave 23:00 next day; arrive 04:00 leave
 * 18:00 same day) is covered by unit tests.
 *
 * <ul>
 *   <li><b>night</b>: one charge per calendar night between arrival and the standard checkout time.
 *       Leaving after checkout time + grace adds a late-checkout line per {@code late_checkout_policy}.
 *       Same-day departure is a day-use stay when allowed, otherwise one night.</li>
 *   <li><b>24h</b>: one charge per started 24-hour period from arrival, with the grace period applied to the last one.</li>
 * </ul>
 */
public final class ChargeEngine {
    private ChargeEngine() {}

    public record Stay(OffsetDateTime arriveAt, OffsetDateTime departAt, long ratePaise, String unitLabel, ZoneId zone) {}

    public static List<StayCharge> compute(Stay stay, Settings s) {
        return switch (s.billingMode()) {
            case "24h" -> per24Hours(stay, s);
            default -> perNight(stay, s);
        };
    }

    private static List<StayCharge> perNight(Stay stay, Settings s) {
        ZonedDateTime arrive = stay.arriveAt().atZoneSameInstant(stay.zone());
        ZonedDateTime depart = stay.departAt().atZoneSameInstant(stay.zone());
        LocalDate arriveDay = arrive.toLocalDate();
        LocalDate departDay = depart.toLocalDate();
        List<StayCharge> out = new ArrayList<>();

        if (departDay.equals(arriveDay)) {
            if (s.dayUseAllowed()) {
                out.add(new StayCharge(StayCharge.Kind.DAY_USE, arriveDay, "Day use " + stay.unitLabel(), in.pms.money.Money.percentBp(stay.ratePaise(), s.dayUseRatePct() * 100), 1));
            } else {
                out.add(new StayCharge(StayCharge.Kind.ROOM_CHARGE, arriveDay, "Room " + stay.unitLabel(), stay.ratePaise(), 1));
            }
            return out;
        }

        for (LocalDate d = arriveDay; d.isBefore(departDay); d = d.plusDays(1)) {
            out.add(new StayCharge(StayCharge.Kind.ROOM_CHARGE, d, "Room " + stay.unitLabel() + " night of " + d, stay.ratePaise(), 1));
        }
        // Late checkout: departing after checkout time + grace on the departure day
        LocalTime limit = s.checkoutTime().plusMinutes(s.lateGraceMinutes());
        if (depart.toLocalTime().isAfter(limit)) {
            long late = switch (s.lateCheckoutPolicy()) {
                case "half_day" -> in.pms.money.Money.percentBp(stay.ratePaise(), 5000);
                case "full_day" -> stay.ratePaise();
                default -> 0;
            };
            if (late > 0) out.add(new StayCharge(StayCharge.Kind.LATE_CHECKOUT, departDay, "Late checkout " + stay.unitLabel(), late, 1));
        }
        return out;
    }

    private static List<StayCharge> per24Hours(Stay stay, Settings s) {
        Duration length = Duration.between(stay.arriveAt(), stay.departAt());
        Duration grace = Duration.ofMinutes(s.lateGraceMinutes());
        long periods = Math.max(1, (long) Math.ceil(Math.max(0, length.minus(grace).toMinutes()) / (24.0 * 60)));
        if (length.compareTo(Duration.ofHours(24)) <= 0 && s.dayUseAllowed() && sameLocalDay(stay)) {
            return List.of(new StayCharge(StayCharge.Kind.DAY_USE, stay.arriveAt().atZoneSameInstant(stay.zone()).toLocalDate(),
                    "Day use " + stay.unitLabel(), in.pms.money.Money.percentBp(stay.ratePaise(), s.dayUseRatePct() * 100), 1));
        }
        List<StayCharge> out = new ArrayList<>();
        ZonedDateTime start = stay.arriveAt().atZoneSameInstant(stay.zone());
        for (int i = 0; i < periods; i++) {
            out.add(new StayCharge(StayCharge.Kind.ROOM_CHARGE, start.plusDays(i).toLocalDate(), "Room " + stay.unitLabel() + " 24h from " + start.plusDays(i).toLocalTime().withSecond(0).withNano(0), stay.ratePaise(), 1));
        }
        return out;
    }

    private static boolean sameLocalDay(Stay stay) {
        return stay.arriveAt().atZoneSameInstant(stay.zone()).toLocalDate().equals(stay.departAt().atZoneSameInstant(stay.zone()).toLocalDate());
    }
}
