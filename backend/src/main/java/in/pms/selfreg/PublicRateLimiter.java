package in.pms.selfreg;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A brake on the one door that opens without a login.
 *
 * <p>A self-registration token is 256 random bits, so guessing one is not a realistic attack; this exists so
 * that trying is not free either, and so a single phone cannot hammer the form. Counts are per caller
 * address in a fixed window, in memory: this is a rate limit, not an audit trail, and losing the counters on
 * a restart is an acceptable trade for keeping a public endpoint off the database.
 */
@Component
public class PublicRateLimiter {
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final int MAX_PER_WINDOW = 30;
    /** Bounded so a flood of distinct addresses cannot grow the map without limit. */
    private static final int MAX_TRACKED = 10_000;

    private final Map<String, Counter> counters = new ConcurrentHashMap<>();

    private record Counter(Instant resets, AtomicInteger hits) {}

    /** @return true when this caller is within its allowance. */
    public boolean allow(String caller) { return allow(caller, MAX_PER_WINDOW); }

    /** A tighter allowance for one action, e.g. {@code allow("book:" + ip, 5)}: its own key, its own count. */
    public boolean allow(String caller, int maxPerWindow) {
        Instant now = Instant.now();
        if (counters.size() > MAX_TRACKED) counters.entrySet().removeIf(e -> e.getValue().resets().isBefore(now));
        Counter c = counters.compute(caller == null ? "unknown" : caller,
                (k, existing) -> existing == null || existing.resets().isBefore(now)
                        ? new Counter(now.plus(WINDOW), new AtomicInteger())
                        : existing);
        return c.hits().incrementAndGet() <= maxPerWindow;
    }
}
