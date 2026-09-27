import { CommonActions } from "@react-navigation/native"
import { observer } from "mobx-react-lite"

import {
  Button,
  Chip,
  ErrorState,
  Input,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Screen,
  SectionLabel,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import type { AllRoutes } from "@/navigators/navigationTypes"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"

import { changedFromDefault } from "../lib/settingsDraft"
import type { Registry, SettingValues } from "../types"

/** Routes these rows open; none takes params. */
type Route = {
  [K in keyof AllRoutes]: undefined extends AllRoutes[K] ? K : never
}[keyof AllRoutes]

const OPERATIONS: {
  route: Route
  label: string
  perms: import("@/utils/permissions").Permission[]
}[] = [
  { route: "Maintenance", label: "maint.title", perms: ["maintenance", "maintenance.report"] },
  { route: "LostFound", label: "lost.title", perms: ["lost_found"] },
  { route: "Restaurant", label: "pos.title", perms: ["restaurant"] },
  { route: "Inventory", label: "stock.title", perms: ["inventory"] },
  { route: "Expenses", label: "expense.title", perms: ["expenses"] },
  { route: "Audit", label: "audit.title", perms: ["audit.view"] },
]

const SETUP: { route: Route; label: string }[] = [
  { route: "PropertyDetails", label: "settings.property" },
  { route: "RoomTypes", label: "settings.rooms" },
  { route: "TaxRules", label: "settings.tax" },
  { route: "Staff", label: "settings.users" },
  { route: "Channels", label: "channels.title" },
]

/** The hub: operations modules, property setup, one row per rules group, account and logout. */
export const SettingsScreen = observer(function SettingsScreen() {
  const navigation = useAppNavigation()
  const { auth } = useStores()
  const { hasAny, can, isSuperAdmin, user } = usePermission()
  const registry = useResource<Registry>(() => api.settings.registry(), [], {
    cacheKey: "registry",
    enabled: !!user?.propertyId,
  })
  const values = useResource<SettingValues>(() => api.settings.values(), [], {
    cacheKey: "settings",
    enabled: !!user?.propertyId,
  })
  const groups = registry.data ? Object.keys(registry.data.groups) : []
  const operations = OPERATIONS.filter((o) => hasAny(o.perms))
  // The rows come from data, so the route name is a union; dispatch takes any registered name.
  const go = (route: Route) => navigation.dispatch(CommonActions.navigate({ name: route }))

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
    >
      <AppHeader />
      <PageHeader
        title={translate("settings.title")}
        subtitle={`${user?.name ?? ""} · ${user?.position ? translateOr(`role.${user.position}`, user.position) : ""}`}
      />
      {user?.propertyId && (
        <Input
          placeholder={translate("settings.search")}
          onFocus={() => navigation.navigate("SettingsGroup", { group: "search" })}
        />
      )}
      {operations.length > 0 && (
        <>
          <SectionLabel text={translate("settings.operationsGroup")} />
          <ListCard>
            {operations.map((o, i) => (
              <ListRow
                key={o.route}
                title={translate(o.label as "maint.title")}
                onPress={() => go(o.route)}
                last={i === operations.length - 1}
              />
            ))}
          </ListCard>
        </>
      )}
      {can("MANAGER") && user?.propertyId && (
        <>
          <SectionLabel text={translate("settings.setupGroup")} />
          <ListCard>
            {SETUP.map((s, i) => (
              <ListRow
                key={s.route}
                title={translate(s.label as "settings.property")}
                onPress={() => go(s.route)}
                last={!isSuperAdmin && i === SETUP.length - 1}
              />
            ))}
            {isSuperAdmin && (
              <ListRow
                title={translate("admin.title")}
                onPress={() => navigation.navigate("PlatformList")}
                last
              />
            )}
          </ListCard>
        </>
      )}
      {registry.loading && !registry.data && <Loading rows={2} />}
      {registry.problem && !registry.data && (
        <ErrorState message={registry.problem.message} onRetry={registry.reload} />
      )}
      {groups.length > 0 && (
        <>
          <SectionLabel text={translate("settings.rules")} />
          <ListCard>
            {groups.map((g, i) => {
              const defs = registry.data!.definitions.filter(
                (d) => d.group === g && (d.who !== "SUPER_ADMIN" || isSuperAdmin),
              )
              if (defs.length === 0) return null
              const changed = changedFromDefault(defs, values.data ?? {})
              return (
                <ListRow
                  key={g}
                  title={translateOr(`settings.group.${g}`, registry.data!.groups[g])}
                  right={changed > 0 ? <Chip tone="brand" text={String(changed)} /> : undefined}
                  onPress={() => navigation.navigate("SettingsGroup", { group: g })}
                  last={i === groups.length - 1}
                />
              )
            })}
          </ListCard>
        </>
      )}
      <SectionLabel text={translate("common.more")} />
      <ListCard>
        <ListRow
          title={translate("notif.title")}
          onPress={() => navigation.navigate("Notifications")}
        />
        {auth.otherMemberships.length > 0 && (
          <ListRow
            title={translate("portfolio.title")}
            onPress={() => navigation.navigate("Portfolio")}
          />
        )}
        <ListRow
          title={translate("mobile.sessions")}
          onPress={() => navigation.navigate("Sessions")}
          last
        />
      </ListCard>
      <Button
        preset="danger"
        text={translate("action.logout")}
        onPress={() => void auth.logout()}
      />
    </Screen>
  )
})
