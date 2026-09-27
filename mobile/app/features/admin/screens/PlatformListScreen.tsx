import { useState } from "react"
import { RefreshControl, View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Avatar,
  Button,
  Chip,
  Empty,
  ErrorState,
  Input,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Screen,
  Segmented,
  showError,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { CredentialsSheet, type Credentials } from "@/features/settings/components/StaffSheets"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import type { Tone } from "@/theme/tones"
import { toCsv } from "@/utils/csv"
import { formatDateTime } from "@/utils/date"
import { shareText } from "@/utils/files"

import { OnboardSheet } from "../components/OnboardSheet"
import { PlatformTiles } from "../components/PlatformTiles"
import { isQuiet, needsAttention, type PropertyHealth } from "../types"

type Filter = "all" | "trial" | "active" | "attention" | "quiet"
export const BILLING_TONE: Record<string, Tone> = {
  active: "ok",
  trial: "brand",
  overdue: "warn",
  readonly: "danger",
  closed: "neutral",
}

/** Every property on the platform and how each is doing. */
export const PlatformListScreen = observer(function PlatformListScreen() {
  const navigation = useAppNavigation()
  const { isSuperAdmin } = usePermission()
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [onboarding, setOnboarding] = useState(false)
  const [creds, setCreds] = useState<Credentials | null>(null)
  const properties = useResource(() => api.admin.properties(), [], {
    cacheKey: "admin.properties",
    enabled: isSuperAdmin,
  })
  const all = properties.data ?? []
  const matches = (p: PropertyHealth) =>
    `${p.propertyName} ${p.code} ${p.orgName} ${p.city}`
      .toLowerCase()
      .includes(q.trim().toLowerCase())
  const byFilter = (p: PropertyHealth) =>
    filter === "all" ||
    (filter === "attention"
      ? needsAttention(p)
      : filter === "quiet"
        ? isQuiet(p)
        : p.billingStatus === filter)
  const shown = all
    .filter((p) => matches(p) && byFilter(p))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName))

  const exportCsv = async () => {
    const rows = [
      [
        "Property",
        "Code",
        "City",
        "Organisation",
        "Plan",
        "Billing",
        "Rooms",
        "In house",
        "Bookings 30d",
        "Outstanding",
        "Last used",
      ],
      ...shown.map((p) => [
        p.propertyName,
        p.code,
        p.city,
        p.orgName,
        p.plan,
        p.billingStatus,
        p.rooms,
        p.stayingNow,
        p.bookingsLast30Days,
        p.outstandingPaise / 100,
        p.lastActivityAt ?? "",
      ]),
    ]
    await shareText("properties.csv", toCsv(rows))
  }

  if (!isSuperAdmin)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <Empty text={translate("mobile.noPermissionScreen")} />
      </Screen>
    )
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: (
          <RefreshControl refreshing={properties.refreshing} onRefresh={properties.reload} />
        ),
      }}
    >
      <AppHeader />
      <PageHeader
        title={translate("admin.title")}
        subtitle={translate("admin.subtitle")}
        actions={
          <>
            <Button preset="secondary" size="sm" text="CSV" onPress={exportCsv} />
            <Button
              size="sm"
              text={translate("admin.onboard")}
              onPress={() => setOnboarding(true)}
            />
          </>
        }
      />
      <PlatformTiles all={all} />
      <Segmented<Filter>
        scroll
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: translate("common.all"), count: all.length },
          {
            value: "trial",
            label: translate("admin.status.trial"),
            count: all.filter((p) => p.billingStatus === "trial").length,
          },
          {
            value: "active",
            label: translate("admin.status.active"),
            count: all.filter((p) => p.billingStatus === "active").length,
          },
          {
            value: "attention",
            label: translate("admin.attention"),
            count: all.filter(needsAttention).length,
          },
          {
            value: "quiet",
            label: translate("admin.quiet"),
            count: all.filter((p) => isQuiet(p)).length,
          },
        ]}
      />
      <Input
        value={q}
        onChangeText={setQ}
        placeholder={translate("admin.search")}
        autoCorrect={false}
      />
      {properties.loading && <Loading />}
      {properties.problem && !properties.data && (
        <ErrorState message={properties.problem.message} onRetry={properties.reload} />
      )}
      {properties.data && shown.length === 0 && (
        <Empty text={all.length ? translate("admin.noMatch") : translate("admin.none")} />
      )}
      {shown.length > 0 && (
        <ListCard>
          {shown.map((p, i) => (
            <ListRow
              key={p.propertyId}
              leading={
                <Avatar
                  name={p.propertyName}
                  tone={p.active ? BILLING_TONE[p.billingStatus] : "neutral"}
                />
              }
              title={p.propertyName}
              subtitle={`${p.code} · ${p.city} · ${p.orgName}${p.plan ? ` · ${p.plan}` : ""} · ${p.lastActivityAt ? formatDateTime(p.lastActivityAt) : translate("admin.never")}`}
              right={
                <View style={$chips}>
                  {!p.active ? (
                    <Chip tone="neutral" text={translate("admin.inactiveShort")} />
                  ) : (
                    <Chip
                      tone={BILLING_TONE[p.billingStatus]}
                      text={translate(`admin.status.${p.billingStatus}` as "admin.status.active")}
                    />
                  )}
                  {isQuiet(p) && <Chip tone="violet" text={translate("admin.quiet")} />}
                </View>
              }
              onPress={() => navigation.navigate("PlatformProperty", { id: p.propertyId })}
              last={i === shown.length - 1}
            />
          ))}
        </ListCard>
      )}
      {onboarding && (
        <OnboardSheet
          onClose={() => setOnboarding(false)}
          onDone={(r) => {
            setOnboarding(false)
            void properties.reload()
            if (!r.ok) return showError(r.problem)
            setCreds({
              code: r.data.code,
              email: r.data.ownerEmail,
              password: r.data.ownerPassword,
            })
          }}
        />
      )}
      {creds && <CredentialsSheet creds={creds} onClose={() => setCreds(null)} />}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $chips: ViewStyle = { alignItems: "flex-end", gap: 4 }
