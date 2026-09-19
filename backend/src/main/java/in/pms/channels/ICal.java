package in.pms.channels;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Just enough of RFC 5545 to swap busy dates with an OTA: read the events out of a calendar, and write
 * all-day events back.
 *
 * <p>Availability here is per night, so an event is reduced to the dates it covers. A DTSTART given as a
 * time is taken at its date; recurrence is not supported, and no OTA uses it for bookings.
 */
public final class ICal {
    private ICal() {}

    /** One stay or block: nights from {@code start} up to, not including, {@code end}. */
    public record Event(String uid, LocalDate start, LocalDate end, String summary, boolean cancelled) {}

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    /** The events in a calendar. One malformed event is skipped rather than losing the whole calendar. */
    public static List<Event> parse(String body) {
        List<Event> events = new ArrayList<>();
        Map<String, String> current = null;
        for (String line : unfold(body)) {
            if (line.equalsIgnoreCase("BEGIN:VEVENT")) { current = new HashMap<>(); continue; }
            if (line.equalsIgnoreCase("END:VEVENT")) {
                if (current != null) toEvent(current).ifPresent(events::add);
                current = null;
                continue;
            }
            if (current == null) continue;
            int colon = valueStart(line);
            if (colon <= 0) continue;
            String name = line.substring(0, colon);
            int semi = name.indexOf(';');
            current.putIfAbsent((semi < 0 ? name : name.substring(0, semi)).toUpperCase(Locale.ROOT), line.substring(colon + 1));
        }
        return events;
    }

    /** A calendar of all-day events, as OTAs import it. */
    public static String render(String name, List<Event> events, Instant stamp) {
        StringBuilder out = new StringBuilder();
        line(out, "BEGIN:VCALENDAR");
        line(out, "VERSION:2.0");
        line(out, "PRODID:-//Dharamshala PMS//Calendar sync//EN");
        line(out, "CALSCALE:GREGORIAN");
        line(out, "METHOD:PUBLISH");
        line(out, "X-WR-CALNAME:" + escape(name));
        for (Event e : events) {
            line(out, "BEGIN:VEVENT");
            line(out, "UID:" + e.uid());
            line(out, "DTSTAMP:" + STAMP.format(stamp));
            line(out, "DTSTART;VALUE=DATE:" + DateTimeFormatter.BASIC_ISO_DATE.format(e.start()));
            line(out, "DTEND;VALUE=DATE:" + DateTimeFormatter.BASIC_ISO_DATE.format(e.end()));
            line(out, "SUMMARY:" + escape(e.summary()));
            line(out, "END:VEVENT");
        }
        line(out, "END:VCALENDAR");
        return out.toString();
    }

    private static Optional<Event> toEvent(Map<String, String> p) {
        Optional<LocalDate> start = date(p.get("DTSTART"));
        if (start.isEmpty()) return Optional.empty();
        LocalDate end = date(p.get("DTEND")).filter(d -> d.isAfter(start.get())).orElse(start.get().plusDays(1));
        String summary = unescape(p.getOrDefault("SUMMARY", "")).trim();
        // A feed without UIDs still has to sync: the dates then identify the event.
        String uid = p.getOrDefault("UID", "").trim();
        if (uid.isEmpty()) uid = "dates-" + start.get() + "-" + end;
        return Optional.of(new Event(uid, start.get(), end, summary, "CANCELLED".equalsIgnoreCase(p.getOrDefault("STATUS", "").trim())));
    }

    /** "20260920", "20260920T140000Z" or "20260920T140000" — the first eight digits are the date. */
    private static Optional<LocalDate> date(String value) {
        if (value == null) return Optional.empty();
        String v = value.trim();
        if (v.length() < 8) return Optional.empty();
        try { return Optional.of(LocalDate.parse(v.substring(0, 8), DateTimeFormatter.BASIC_ISO_DATE)); }
        catch (RuntimeException e) { return Optional.empty(); }
    }

    /** Joins folded lines: a line starting with a space or tab continues the one before it. */
    private static List<String> unfold(String body) {
        List<String> lines = new ArrayList<>();
        for (String raw : body.split("\r?\n")) {
            if (!lines.isEmpty() && (raw.startsWith(" ") || raw.startsWith("\t"))) {
                lines.set(lines.size() - 1, lines.getLast() + raw.substring(1));
            } else if (!raw.isBlank()) {
                lines.add(raw);
            }
        }
        return lines;
    }

    /** The colon that ends the property name; one inside a quoted parameter such as TZID="..." does not count. */
    private static int valueStart(String line) {
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') quoted = !quoted;
            else if (c == ':' && !quoted) return i;
        }
        return -1;
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n");
    }

    private static String unescape(String s) {
        return s.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\");
    }

    private static void line(StringBuilder out, String line) { out.append(line).append("\r\n"); }
}
