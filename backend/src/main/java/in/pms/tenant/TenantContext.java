package in.pms.tenant;

import java.util.Optional;
import java.util.UUID;

/**
 * The property the current request or job is working in.
 *
 * <p>Set in exactly two places: the session filter (from the user's verified membership) and the job runner
 * (when iterating properties). Cleared in a finally block by the same code. Everything else only reads it.
 * Virtual threads carry their own ThreadLocal, so one request never sees another's tenant.
 */
public final class TenantContext {
    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();

    private TenantContext() {}

    public static Optional<UUID> current() { return Optional.ofNullable(CURRENT.get()); }

    /** The current tenant, or an error if none is set. Services call this instead of trusting request bodies. */
    public static UUID require() {
        UUID id = CURRENT.get();
        if (id == null) throw new IllegalStateException("No tenant in context");
        return id;
    }

    /** Run {@code body} with {@code propertyId} as the tenant, restoring the previous value afterwards. */
    public static <T> T runAs(UUID propertyId, java.util.function.Supplier<T> body) {
        UUID previous = CURRENT.get();
        CURRENT.set(propertyId);
        try { return body.get(); } finally { if (previous == null) CURRENT.remove(); else CURRENT.set(previous); }
    }

    public static void runAs(UUID propertyId, Runnable body) { runAs(propertyId, () -> { body.run(); return null; }); }
}
