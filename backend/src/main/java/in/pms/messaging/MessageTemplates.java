package in.pms.messaging;

import in.pms.money.Money;

import java.util.List;
import java.util.Map;

/**
 * The WhatsApp templates, and their email equivalents. Body variables are positional, so the order here must
 * match what was submitted to Meta for approval. The first four were registered in v1; booking_cancelled,
 * payment_received and checkout_reminder must be submitted (utility category) before they can be delivered.
 */
public final class MessageTemplates {
    private MessageTemplates() {}

    public static final String BOOKING_CONFIRMED = "booking_confirmed";
    public static final String CHECKIN_RECEIPT = "checkin_receipt";
    public static final String CHECKOUT_RECEIPT = "checkout_receipt";
    public static final String DAILY_SUMMARY_OWNER = "daily_summary_owner";
    public static final String BOOKING_CANCELLED = "booking_cancelled";
    public static final String PAYMENT_RECEIVED = "payment_received";
    public static final String CHECKOUT_REMINDER = "checkout_reminder";

    /** Plain-text fallback used by email and the console adapter, so a message is readable without Meta. */
    public static String asText(String template, List<String> params) {
        return switch (template) {
            case BOOKING_CONFIRMED -> "Booking confirmed at %s for %s. Arrival %s, departure %s, %s. Advance paid %s. Contact %s."
                    .formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3), get(params, 4), get(params, 5), get(params, 6));
            case CHECKIN_RECEIPT -> "Receipt %s for %s. Welcome to %s.".formatted(get(params, 0), get(params, 1), get(params, 2));
            case CHECKOUT_RECEIPT -> "Invoice %s for %s. Thank you for staying at %s.".formatted(get(params, 0), get(params, 1), get(params, 2));
            case DAILY_SUMMARY_OWNER -> "%s summary for %s: collections %s, arrivals %s, departures %s, occupancy %s, outstanding %s."
                    .formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3), get(params, 4), get(params, 5), get(params, 6));
            case BOOKING_CANCELLED -> "Your booking at %s for %s, arriving %s, is cancelled. Contact %s.".formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3));
            case PAYMENT_RECEIVED -> "Received %s from %s at %s. Reference %s.".formatted(get(params, 1), get(params, 0), get(params, 2), get(params, 3));
            case CHECKOUT_REMINDER -> "%s, your checkout at %s is at %s today. Please settle any balance at the desk.".formatted(get(params, 0), get(params, 1), get(params, 2));
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

    public static Map<String, Object> bookingCancelled(String guestName, String propertyName, String arrive, String propertyPhone, String toPhone, String language) {
        return Map.of("to", toPhone, "template", BOOKING_CANCELLED, "language", language, "params", List.of(guestName, propertyName, arrive, propertyPhone));
    }

    public static Map<String, Object> paymentReceived(String guestName, long amountPaise, String propertyName, String reference, String toPhone, String language) {
        return Map.of("to", toPhone, "template", PAYMENT_RECEIVED, "language", language, "params", List.of(guestName, Money.format(amountPaise), propertyName, reference));
    }

    public static Map<String, Object> checkoutReminder(String guestName, String propertyName, String time, String toPhone, String language) {
        return Map.of("to", toPhone, "template", CHECKOUT_REMINDER, "language", language, "params", List.of(guestName, propertyName, time));
    }

    private static String get(List<String> p, int i) { return i < p.size() ? p.get(i) : ""; }
}
