package in.pms.charges;

import java.time.LocalDate;

/** One line the charge engine wants on the folio. */
public record StayCharge(Kind kind, LocalDate date, String description, long unitPaise, int qty) {
    public enum Kind { ROOM_CHARGE, DAY_USE, LATE_CHECKOUT }
    public long amountPaise() { return unitPaise * qty; }
}
