package in.pms.channels;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ICalTest {
    private static final String OTA_FEED = String.join("\r\n",
            "BEGIN:VCALENDAR",
            "PRODID:-//Some OTA//EN",
            "BEGIN:VEVENT",
            "DTSTART;VALUE=DATE:20261010",
            "DTEND;VALUE=DATE:20261013",
            "UID:abc-123@ota",
            "SUMMARY:Reserved\\, 2 guests",
            "DESCRIPTION:Reservation URL: https://example.com/r/abc-12",
            " 3 and more text on a folded line",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "DTSTART;TZID=\"Asia/Kolkata\":20261020T140000",
            "UID:no-end@ota",
            "SUMMARY:Not available",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "DTSTART:20261101",
            "DTEND:20261102",
            "UID:gone@ota",
            "STATUS:CANCELLED",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "SUMMARY:no start date, skipped",
            "END:VEVENT",
            "END:VCALENDAR");

    @Test
    void readsTheEventsAnOtaExports() {
        List<ICal.Event> events = ICal.parse(OTA_FEED);
        assertThat(events).hasSize(3);

        ICal.Event stay = events.getFirst();
        assertThat(stay.uid()).isEqualTo("abc-123@ota");
        assertThat(stay.start()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(stay.end()).isEqualTo(LocalDate.of(2026, 10, 13));
        assertThat(stay.summary()).isEqualTo("Reserved, 2 guests");
        assertThat(stay.cancelled()).isFalse();

        // A timed start inside a quoted TZID parameter still yields its date; no end means one night.
        ICal.Event block = events.get(1);
        assertThat(block.start()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(block.end()).isEqualTo(LocalDate.of(2026, 10, 21));

        assertThat(events.get(2).cancelled()).isTrue();
    }

    @Test
    void writesAllDayEventsThatReadBackTheSame() {
        var events = List.of(new ICal.Event("u1@pms", LocalDate.of(2026, 12, 24), LocalDate.of(2026, 12, 26), "Not available", false));
        String body = ICal.render("Shri Ram, 101", events, Instant.parse("2026-09-18T10:00:00Z"));

        assertThat(body).contains("\r\nDTSTART;VALUE=DATE:20261224\r\n", "\r\nDTEND;VALUE=DATE:20261226\r\n", "X-WR-CALNAME:Shri Ram\\, 101");
        assertThat(body).startsWith("BEGIN:VCALENDAR\r\n").endsWith("END:VCALENDAR\r\n");
        assertThat(ICal.parse(body)).containsExactlyElementsOf(events);
    }

    @Test
    void aFeedWithoutUidsStillSyncsByItsDates() {
        var events = ICal.parse("BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261010\nDTEND;VALUE=DATE:20261012\nEND:VEVENT\n");
        assertThat(events).singleElement().extracting(ICal.Event::uid).isEqualTo("dates-2026-10-10-2026-10-12");
    }
}
