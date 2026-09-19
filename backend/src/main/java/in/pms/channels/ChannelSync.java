package in.pms.channels;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Pulls one OTA calendar and applies it.
 *
 * <p>Kept apart from {@link ChannelService} for two reasons: the download happens outside any database
 * transaction, and a failed apply rolls back its own transaction while the error is still written, in a
 * new one, onto the link where the owner sees it. It never throws: one broken calendar must not stop the rest.
 */
@Component
public class ChannelSync {
    private static final Logger log = LoggerFactory.getLogger(ChannelSync.class);

    private final CalendarFetcher fetcher;
    private final ChannelService channels;

    public ChannelSync(CalendarFetcher fetcher, ChannelService channels) {
        this.fetcher = fetcher; this.channels = channels;
    }

    /** @return what changed, or empty when the link has no calendar to pull or the pull failed. */
    public Optional<ChannelService.SyncResult> sync(UUID linkId) {
        Optional<String> url = channels.importUrl(linkId);
        if (url.isEmpty()) return Optional.empty();
        try {
            String body = fetcher.fetch(url.get());
            if (!body.contains("BEGIN:VCALENDAR")) throw new java.io.IOException("That address did not return a calendar");
            ChannelService.SyncResult result = channels.apply(linkId, ICal.parse(body));
            channels.markSynced(linkId, result.clashes() > 0 ? result.clashes() + " stay(s) clash with bookings here" : null);
            return Optional.of(result);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            channels.markFailed(linkId, "Sync was interrupted; it will run again");
        } catch (Exception e) {
            log.warn("Calendar sync failed for link {}: {}", linkId, e.toString());
            channels.markFailed(linkId, explain(e));
        }
        return Optional.empty();
    }

    /** What the owner sees on the link. Only messages written for people; never a stack or an SQL error. */
    private static String explain(Exception e) {
        if (e instanceof java.net.UnknownHostException) return "That calendar address could not be found";
        if (e instanceof java.net.http.HttpTimeoutException) return "The calendar took too long to answer; it will be tried again";
        boolean ours = e instanceof java.io.IOException && e.getClass() == java.io.IOException.class || e instanceof in.pms.common.ConflictException;
        return ours && e.getMessage() != null ? e.getMessage() : "The calendar could not be read; it will be tried again";
    }
}
