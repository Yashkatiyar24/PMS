import { useStores } from "@/models/useStores"
import type { Permission, Role } from "@/utils/permissions"

/**
 * The one gate for screens and actions: `has("refund")` for a permission, `can("MANAGER")` for a rank.
 * Hiding is a courtesy; every endpoint checks again.
 */
export function usePermission() {
  const { auth } = useStores()
  return {
    has: (permission: Permission) => auth.has(permission),
    hasAny: (permissions: Permission[]) => permissions.some((p) => auth.has(p)),
    can: (role: Role) => auth.can(role),
    isSuperAdmin: !!auth.user?.superAdmin,
    user: auth.user,
  }
}
