package in.pms.auth;

import java.util.List;
import java.util.Set;
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
        Role role,                // rank in propertyId, or null
        List<Membership> memberships,
        String position,          // the role as stored: owner, admin, receptionist, housekeeping, ...
        Set<String> permissions,  // what that role may do, from Permissions
        String billingStatus,     // the working property's subscription state: trial, active, overdue, readonly, closed; null outside a property
        boolean mustChangePassword // signed in with a password someone else chose; only the screen to replace it is open
) {
    /** Without a billing state or a pending password change, for callers that never reach those gates. */
    public CurrentUser(UUID id, String name, boolean superAdmin, UUID sessionId, UUID propertyId, Role role,
                       List<Membership> memberships, String position, Set<String> permissions) {
        this(id, name, superAdmin, sessionId, propertyId, role, memberships, position, permissions, null, false);
    }

    /** Rank. LIMITED is the narrow roles (housekeeping, accountant, maintenance), below the front desk. */
    public enum Role { LIMITED, STAFF, MANAGER, OWNER;
        public boolean atLeast(Role other) { return ordinal() >= other.ordinal(); }
    }
    public record Membership(UUID propertyId, String propertyName, Role role, String position) {}

    public boolean hasRole(Role r) { return role != null && role.atLeast(r); }
    public boolean can(String permission) { return permissions != null && permissions.contains(permission); }
}
