import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Banner,
  Chip,
  ChoiceChips,
  Disclosure,
  ErrorState,
  Input,
  KV,
  Loading,
  PageHeader,
  Panel,
  Screen,
  SectionLabel,
  StatTile,
  Switch,
  Text,
  showError,
  showToast,
} from "@/components"
import type { BillingStatus } from "@/features/auth/types"
import { PropertyPhotoCard } from "@/features/settings/components/PropertyPhotoCard"
import { CredentialsSheet, type Credentials } from "@/features/settings/components/StaffSheets"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { formatDate, formatDateTime } from "@/utils/date"
import { rupees } from "@/utils/format"

import { TeamList } from "../components/TeamList"
import { BILLING_STATUSES, isQuiet, MODULES } from "../types"
import { BILLING_TONE } from "./PlatformListScreen"

const MODULE_LABEL: Record<string, string> = {
  restaurant: "pos.title",
  inventory: "stock.title",
  expenses: "expense.title",
  maintenance: "maint.title",
  lost_found: "lost.title",
  audit: "audit.title",
}

/** One property from the platform side: photo, plan, billing, on/off, modules, team, notes, recent changes. */
export function PlatformPropertyScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"PlatformProperty">()
  const { theme } = useAppTheme()
  const property = useResource(() => api.admin.property(params.id), [params.id])
  const team = useResource(() => api.admin.team(params.id), [params.id])
  const activity = useResource(() => api.admin.activity(params.id), [params.id])
  const plans = useResource(() => api.admin.plans(), [], { cacheKey: "admin.plans" })
  const [notes, setNotes] = useState<string | null>(null)
  const [creds, setCreds] = useState<Credentials | null>(null)
  const p = property.data

  const act = async (
    call: () => Promise<{ ok: boolean; problem?: import("@/services/api").ApiProblem }>,
  ) => {
    const r = await call()
    if (!r.ok && r.problem) return showError(r.problem)
    showToast(translate("action.done"), "ok")
    void property.reload()
  }

  if (property.loading && !p)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <Loading />
      </Screen>
    )
  if (!p)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <PageHeader title={translate("admin.title")} onBack={() => navigation.goBack()} />
        <ErrorState message={property.problem?.message} onRetry={property.reload} />
      </Screen>
    )
  const plan = plans.data?.find((x) => x.code === p.plan)

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={p.propertyName}
        subtitle={`${p.code} · ${p.orgName} · ${p.city}`}
        onBack={() => navigation.goBack()}
      />
      <View style={$chips}>
        <Chip
          tone={BILLING_TONE[p.billingStatus]}
          text={translate(`admin.status.${p.billingStatus}` as "admin.status.active")}
        />
        {isQuiet(p) && <Chip tone="violet" text={translate("admin.quiet")} />}
      </View>
      {!p.active && <Banner tone="warn" text={translate("admin.inactive")} />}
      <View style={$tiles}>
        <StatTile
          label={translate("admin.roomsCount")}
          value={p.rooms}
          hint={plan ? translate("admin.maxRooms", { n: plan.maxRooms }) : undefined}
          style={$tile}
        />
        <StatTile label={translate("admin.team")} value={p.users} tone="teal" style={$tile} />
        <StatTile label={translate("today.inHouse")} value={p.stayingNow} tone="ok" style={$tile} />
        <StatTile
          label={translate("admin.recentBookings")}
          value={p.bookingsLast30Days}
          tone="violet"
          style={$tile}
        />
        <StatTile
          label={translate("reports.outstanding")}
          value={rupees(p.outstandingPaise)}
          tone="danger"
          hint={translate("admin.openBillsCount", { n: p.openFolios })}
          style={$tile}
        />
        <StatTile
          label={translate("admin.outbox")}
          value={p.outboxPending}
          tone="warn"
          style={$tile}
        />
      </View>
      <Panel>
        <KV label={translate("setup.code")} value={p.code} strong />
        <KV label={translate("admin.trust")} value={p.orgName} />
        <KV
          label={translate("admin.owner")}
          value={`${p.ownerName ?? "—"}${p.ownerPhone ? ` · ${p.ownerPhone}` : ""}`}
        />
        <KV label={translate("setup.phone")} value={p.phone || "—"} />
        <KV label={translate("admin.created")} value={formatDate(p.createdAt)} />
        <KV
          label={translate("admin.lastActivity")}
          value={p.lastActivityAt ? formatDateTime(p.lastActivityAt) : translate("admin.never")}
        />
        {!!p.supportAccess && <Chip tone="ok" text={translate("admin.supportAccess")} />}
      </Panel>
      <PropertyPhotoCard
        photoUrl={p.photoUrl}
        upload={(file) => api.admin.uploadPhoto(p.propertyId, file)}
        remove={() => api.admin.removePhoto(p.propertyId)}
        onSaved={(saved) => property.set(() => saved)}
      />
      <SectionLabel text={translate("admin.planBilling")} />
      <Panel>
        <ChoiceChips
          value={p.plan ?? ""}
          onChange={(planCode) => void act(() => api.admin.setPlan(p.orgId, planCode))}
          options={(plans.data ?? []).map((x) => ({
            value: x.code,
            label: `${x.name} · ${translate("admin.planHint", { rooms: x.maxRooms, price: rupees(x.monthlyPaise) })}`,
          }))}
        />
        <ChoiceChips<BillingStatus>
          value={p.billingStatus}
          onChange={(billingStatus) => void act(() => api.admin.setBilling(p.orgId, billingStatus))}
          options={BILLING_STATUSES.map((s) => ({
            value: s,
            label: translate(`admin.status.${s}` as "admin.status.active"),
          }))}
        />
        <Text
          text={translate("admin.billingHint")}
          size="xxs"
          style={{ color: theme.colors.textFaint }}
        />
        <Switch
          value={p.active}
          onValueChange={(active) => void act(() => api.admin.setActive(p.propertyId, active))}
          label={translate("admin.active")}
          helper={translate("admin.activeHint")}
          labelPosition="right"
        />
      </Panel>
      <SectionLabel text={translate("admin.modules")} />
      <Panel>
        <ChoiceChips
          multi
          value={p.modules}
          onChange={(modules) => void act(() => api.admin.setModules(p.propertyId, modules))}
          options={MODULES.map((m) => ({
            value: m,
            label: translate(MODULE_LABEL[m] as "pos.title"),
          }))}
        />
        <Text
          text={translate("admin.modulesHint")}
          size="xxs"
          style={{ color: theme.colors.textFaint }}
        />
      </Panel>
      <TeamList
        members={team.data ?? []}
        propertyId={p.propertyId}
        code={p.code}
        onCredentials={setCreds}
      />
      <Disclosure title={translate("admin.notes")} summary={p.notes ?? ""}>
        <Input
          value={notes ?? p.notes ?? ""}
          onChangeText={setNotes}
          onBlur={() =>
            notes !== null &&
            notes !== (p.notes ?? "") &&
            void act(() => api.admin.setNotes(p.propertyId, notes))
          }
          multiline
          hint={translate("admin.notesHint")}
        />
      </Disclosure>
      <Disclosure title={translate("admin.activity")}>
        {!!activity.problem && (
          <Text text={activity.problem.message} size="xs" style={{ color: theme.colors.textDim }} />
        )}
        {(activity.data ?? []).slice(0, 30).map((a, i) => (
          <KV
            key={i}
            label={`${translateOr(`audit.table.${a.table_name}`, a.table_name)} · ${a.action}`}
            value={`${formatDateTime(a.at)}${a.who ? ` · ${a.who}` : ""}`}
          />
        ))}
      </Disclosure>
      {!!creds && <CredentialsSheet creds={creds} onClose={() => setCreds(null)} />}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }
const $tiles: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $tile: ViewStyle = { flexBasis: "47%", flexGrow: 1 }
