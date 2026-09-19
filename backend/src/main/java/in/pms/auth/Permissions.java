package in.pms.auth;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What each role may do. One table, so the answer to "can a receptionist refund?" is in one place.
 *
 * <p>A role has a <b>rank</b> and a set of <b>permissions</b>. The rank keeps every existing
 * {@code hasRole('STAFF'|'MANAGER'|'OWNER')} check meaning what it always meant: owner, manager and staff keep
 * exactly the access they had. The three narrow roles (housekeeping, accountant, maintenance) rank below staff,
 * so everything the desk can do is closed to them unless an endpoint names one of their permissions.
 *
 * <p>Permissions also decide who approves an exception without a PIN: a receptionist giving a discount needs
 * the PIN of someone holding {@code discount.apply}; a manager holds it and approves themselves.
 */
public final class Permissions {
    private Permissions() {}

    public static final String RESERVATIONS_VIEW = "reservations.view";
    public static final String RESERVATIONS_CREATE = "reservations.create";
    public static final String RESERVATIONS_EDIT = "reservations.edit";
    public static final String RESERVATIONS_CANCEL = "reservations.cancel";
    public static final String CHECKIN = "checkin";
    public static final String CHECKOUT = "checkout";
    public static final String DISCOUNT = "discount.apply";
    public static final String REFUND = "refund";
    public static final String INVOICE_EDIT = "invoice.edit";
    public static final String REVENUE_VIEW = "revenue.view";
    public static final String ROOMS_MANAGE = "rooms.manage";
    public static final String HOUSEKEEPING = "housekeeping";
    public static final String MAINTENANCE = "maintenance";
    public static final String MAINTENANCE_REPORT = "maintenance.report";
    public static final String STAFF_MANAGE = "staff.manage";
    public static final String SETTINGS_MANAGE = "settings.manage";
    public static final String EXPENSES = "expenses";
    public static final String INVENTORY = "inventory";
    public static final String RESTAURANT = "restaurant";
    public static final String AUDIT_VIEW = "audit.view";

    public static final List<String> ALL = List.of(RESERVATIONS_VIEW, RESERVATIONS_CREATE, RESERVATIONS_EDIT, RESERVATIONS_CANCEL,
            CHECKIN, CHECKOUT, DISCOUNT, REFUND, INVOICE_EDIT, REVENUE_VIEW, ROOMS_MANAGE, HOUSEKEEPING, MAINTENANCE, MAINTENANCE_REPORT,
            STAFF_MANAGE, SETTINGS_MANAGE, EXPENSES, INVENTORY, RESTAURANT, AUDIT_VIEW);

    private static final Set<String> DESK = Set.of(RESERVATIONS_VIEW, RESERVATIONS_CREATE, RESERVATIONS_EDIT, CHECKIN, CHECKOUT,
            HOUSEKEEPING, MAINTENANCE_REPORT, RESTAURANT);

    private static final Map<String, Set<String>> BY_ROLE = Map.of(
            "owner", Set.copyOf(ALL),
            "admin", Set.copyOf(ALL),
            "manager", Set.copyOf(ALL.stream().filter(p -> !p.equals(STAFF_MANAGE)).toList()),
            "receptionist", DESK,
            "staff", DESK,
            "housekeeping", Set.of(HOUSEKEEPING, MAINTENANCE_REPORT, INVENTORY),
            "maintenance", Set.of(MAINTENANCE, MAINTENANCE_REPORT),
            "accountant", Set.of(RESERVATIONS_VIEW, REVENUE_VIEW, REFUND, INVOICE_EDIT, EXPENSES, INVENTORY, AUDIT_VIEW));

    public static final List<String> ROLES = List.of("owner", "admin", "manager", "receptionist", "staff", "housekeeping", "accountant", "maintenance");

    public static Set<String> of(String role) { return BY_ROLE.getOrDefault(role, Set.of()); }

    public static CurrentUser.Role rank(String role) {
        return switch (role) {
            case "owner" -> CurrentUser.Role.OWNER;
            case "admin", "manager" -> CurrentUser.Role.MANAGER;
            case "receptionist", "staff" -> CurrentUser.Role.STAFF;
            default -> CurrentUser.Role.LIMITED;
        };
    }

    /** Roles whose holders may approve {@code permission} for someone else with their PIN. */
    public static List<String> rolesWith(String permission) {
        return ROLES.stream().filter(r -> of(r).contains(permission)).toList();
    }
}
