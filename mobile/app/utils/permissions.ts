/**
 * Pure helpers over the permissions the server hands back in `/api/auth/me`. Mirrors `Permissions.java`:
 * the app never recomputes what a role may do; it only reads `permissions` and `role`.
 */

/** Rank. LIMITED is the narrow roles (housekeeping, accountant, maintenance), below the front desk. */
export type Role = "LIMITED" | "STAFF" | "MANAGER" | "OWNER"

export type Permission =
  | "reservations.view"
  | "reservations.create"
  | "reservations.edit"
  | "reservations.cancel"
  | "checkin"
  | "checkout"
  | "discount.apply"
  | "refund"
  | "invoice.edit"
  | "revenue.view"
  | "rooms.manage"
  | "housekeeping"
  | "maintenance"
  | "maintenance.report"
  | "staff.manage"
  | "settings.manage"
  | "expenses"
  | "inventory"
  | "restaurant"
  | "audit.view"
  | "lost_found"

const RANK: Record<Role, number> = { LIMITED: 0, STAFF: 1, MANAGER: 2, OWNER: 3 }

/** True when `role` is at least `required` (owner ⊃ manager ⊃ staff ⊃ limited). */
export function hasRank(role: Role | null | undefined, required: Role): boolean {
  return !!role && RANK[role] >= RANK[required]
}

/** True when the permission list holds `permission`. */
export function hasPermission(
  permissions: readonly string[] | null | undefined,
  permission: Permission,
): boolean {
  return !!permissions?.includes(permission)
}

/** True when any of the permissions is held. */
export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  wanted: Permission[],
): boolean {
  return wanted.some((p) => hasPermission(permissions, p))
}

/** The stored roles a manager may grant; only an owner may grant `owner` or `admin`. */
export const GRANTABLE_ROLES = [
  "receptionist",
  "housekeeping",
  "maintenance",
  "accountant",
  "manager",
  "admin",
  "owner",
] as const
export type StoredRole = (typeof GRANTABLE_ROLES)[number] | "staff"

/** Roles whose holders may carry an approval PIN. */
export const APPROVER_ROLES: readonly StoredRole[] = ["owner", "admin", "manager", "accountant"]

export function canGrantRole(actorRole: Role | null | undefined, target: StoredRole): boolean {
  if (target === "owner" || target === "admin") return hasRank(actorRole, "OWNER")
  return hasRank(actorRole, "MANAGER")
}

/** Which of the web's bottom tabs a user sees. */
export function visibleTabs(input: {
  permissions: readonly string[]
  superAdmin: boolean
  propertyId: string | null
}): Array<"Today" | "Guests" | "Bookings" | "Rooms" | "Reports" | "Settings" | "Platform"> {
  const { permissions, superAdmin, propertyId } = input
  if (superAdmin && !propertyId) return ["Platform"]
  const desk = hasPermission(permissions, "reservations.view")
  const tabs: Array<
    "Today" | "Guests" | "Bookings" | "Rooms" | "Reports" | "Settings" | "Platform"
  > = []
  if (desk) tabs.push("Today", "Guests", "Bookings")
  if (desk || hasAnyPermission(permissions, ["housekeeping", "maintenance"])) tabs.push("Rooms")
  if (hasPermission(permissions, "revenue.view")) tabs.push("Reports")
  tabs.push("Settings")
  if (superAdmin) tabs.push("Platform")
  return tabs
}

/** Where a signed-in user lands: the desk on Today, narrow roles on Rooms (or Reports), platform admins on Platform. */
export function homeTab(input: {
  permissions: readonly string[]
  superAdmin: boolean
  propertyId: string | null
}) {
  const tabs = visibleTabs(input)
  return tabs[0]
}
