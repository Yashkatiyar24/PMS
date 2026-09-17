package in.pms.messaging;

import in.pms.money.Money;

import java.util.List;
import java.util.Map;

/**
 * The four WhatsApp templates registered with Meta in v1, and their email equivalents.
 * Body variables are positional, so the order here must match what was submitted for approval.
 */
public final class MessageTemplates {
    private MessageTemplates() {}

    public static final String BOOKING_CONFIRMED = "booking_confirmed";
    public static final String CHECKIN_RECEIPT = "checkin_receipt";
    public static final String CHECKOUT_RECEIPT = "checkout_receipt";
    public static final String DAILY_SUMMARY_OWNER = "daily_summary_owner";

    /** Plain-text fallback used by email and the console adapter, so a message is readable without Meta. */
    public static String asText(String template, List<String> params) {
        return switch (template) {
            case BOOKING_CONFIRMED -> "Booking confirmed at %s for %s. Arrival %s, departure %s, %s. Advance paid %s. Contact %s."
                    .formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3), get(params, 4), get(params, 5), get(params, 6));
            case CHECKIN_RECEIPT -> "Receipt %s for %s. Welcome to %s.".formatted(get(params, 0), get(params, 1), get(params, 2));
            case CHECKOUT_RECEIPT -> "Invoice %s for %s. Thank you for staying at %s.".formatted(get(params, 0), get(params, 1), get(params, 2));
            case DAILY_SUMMARY_OWNER -> "%s summary for %s: collections %s, arrivals %s, departures %s, occupancy %s, outstanding %s."
                    .formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3), get(params, 4), get(params, 5), get(params, 6));
            default -> String.join(" · ", params);
        };
    }

    public static Map<String, Object> bookingConfirmed(String guestName, String propertyName, String arrive, String depart, String units, long advancePaise, String propertyPhone, String toPhone, String language) {
        return Map.of("to", toPhone, "template", BOOKING_CONFIRMED, "language", language,
                "params", List.of(guestName, propertyName, arrive, depart, units, Money.format(advancePaise), propertyPhone));
    }

    public static Map<String, Object> receipt(String template, String number, long amountPaise, String propertyName, String toPhone, String language, String pdfKey) {
        return Map.of("to", toPhone, "template", template, "language", language,
                "params", List.of(number, Money.format(amountPaise), propertyName),
                "documentKey", pdfKey == null ? "" : pdfKey, "documentFilename", number.replace('/', '-') + ".pdf");
    }

    private static String get(List<String> p, int i) { return i < p.size() ? p.get(i) : ""; }
}
