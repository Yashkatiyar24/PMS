import { Empty, PageHeader, Screen } from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { translate } from "@/i18n/translate"
import type { Permission, Role } from "@/utils/permissions"

import type { ScreenComponent } from "./navigationTypes"
import { useAppNavigation } from "./useAppNavigation"

export type Gate = { anyOf?: Permission[]; rank?: Role; superAdmin?: boolean }

/**
 * Wrap a screen so it opens only for roles allowed to see it — the one place deep links, pushes and stale
 * navigation state are checked. Hiding is a courtesy; every endpoint checks again.
 */
export function gated(Component: ScreenComponent, gate: Gate): ScreenComponent {
  return function GatedScreen() {
    const { hasAny, can, isSuperAdmin } = usePermission()
    const navigation = useAppNavigation()
    const allowed =
      (gate.superAdmin ? isSuperAdmin : true) &&
      (gate.rank ? can(gate.rank) || isSuperAdmin : true) &&
      (gate.anyOf ? hasAny(gate.anyOf) : true)
    if (!allowed) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={{ padding: 16 }}>
          <PageHeader title={translate("app.name")} onBack={() => navigation.goBack()} />
          <Empty text={translate("mobile.noPermissionScreen")} />
        </Screen>
      )
    }
    return <Component />
  }
}
