package in.pms.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Wrong guesses per key (a person, an account) in a rolling window: a short secret falls to guessing unless
 * guesses run out. ponytail: in memory, per server; a shared store if several servers run.
 */
final class Lockout {
    private static final int MAX_TRACKED = 10_000;
    private final int max;
    private final Duration window;
    private final Map<String, Strikes> strikes = new ConcurrentHashMap<>();
    private record Strikes(Instant since, int count) {}

    Lockout(int max, Duration window) { this.max = max; this.window = window; }

    boolean locked(String key) {
        Strikes s = strikes.get(key);
        return s != null && s.count() >= max && s.since().plus(window).isAfter(Instant.now());
    }

    void fail(String key) {
        Instant now = Instant.now();
        if (strikes.size() > MAX_TRACKED) strikes.entrySet().removeIf(e -> e.getValue().since().plus(window).isBefore(now));
        strikes.merge(key, new Strikes(now, 1), (old, n) -> old.since().plus(window).isBefore(now) ? n : new Strikes(old.since(), old.count() + 1));
    }

    void clear(String key) { strikes.remove(key); }
}
