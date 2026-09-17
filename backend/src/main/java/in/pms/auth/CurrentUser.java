package in.pms.auth;

import java.util.List;
import java.util.UUID;

/**
 * The authenticated principal for one request: who they are, which property they are working in and with
 * what role. Built by {@link SessionAuthFilter} from the session row and the user's memberships; never from
 * request input.
 */
public record CurrentUser(
        UUID id,
        String name,
        boolean superAdmin,
        UUID sessionId,
        UUID propertyId,          // null until a property is selected
        Role role,                // role in propertyId, or null
        List<Membership> memberships
) {
    public enum Role { STAFF, MANAGER, OWNER;
        public boolean atLeast(Role other) { return ordinal() >= other.ordinal(); }
        public static Role parse(String s) { return valueOf(s.toUpperCase()); }
    }
    public record Membership(UUID propertyId, String propertyName, Role role) {}

    public boolean hasRole(Role r) { return role != null && role.atLeast(r); }
}
