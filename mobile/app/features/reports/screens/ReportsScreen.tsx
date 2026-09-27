import { useState } from "react"
import { RefreshControl, View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  ActionSheet,
  Button,
  Chip,
  Disclosure,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  StatTile,
  Text,
  showError,
  showToast,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { addDays, formatDate, formatDateTime } from "@/utils/date"
import { shareText } from "@/utils/files"
import { percent, rupees } from "@/utils/format"

/** The business day: collections by mode, occupancy, unpaid bills, cash in hand; exports and the period report. */
export const ReportsScreen = observer(function ReportsScreen() {
  const navigation = useAppNavigation()
  const { theme } = useAppTheme()
  const { can } = usePermission()
  const [menu, setMenu] = useState(false)
  const daily = useResource(() => api.reports.daily(), [], { cacheKey: "daily", refreshMs: 60_000 })
  const outstanding = useResource(() => api.reports.outstanding(), [], { cacheKey: "outstanding" })
  const cash = useResource(() => api.reports.cashInHand(), [], { cacheKey: "cash" })
  const d = daily.data

  const exportCsv = async (
    name: string,
    fetch: () => Promise<
      { ok: true; data: string } | { ok: false; problem: import("@/services/api").ApiProblem }
    >,
  ) => {
    const r = await fetch()
    if (!r.ok) return showError(r.problem)
    await shareText(name, r.data)
  }
  const handover = async (userId: string) => {
    const r = await api.reports.cashHandover(userId)
    if (!r.ok) return showError(r.problem)
    showToast(`${translate("action.handOver")} · ${rupees(r.data.amountPaise)}`, "ok")
    void cash.reload()
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={daily.refreshing}
            onRefresh={() => {
              void daily.reload()
              void outstanding.reload()
              void cash.reload()
            }}
          />
        ),
      }}
    >
      <AppHeader />
      <PageHeader
        title={translate("nav.reports")}
        subtitle={d ? `${translate("reports.period")} · ${formatDate(d.businessDate)}` : undefined}
        actions={
          <Button
            preset="secondary"
            size="sm"
            text="⋯"
            accessibilityLabel={translate("common.more")}
            onPress={() => setMenu(true)}
          />
        }
      />
      {!!daily.loading && <Loading />}
      {!!daily.problem && !d && (
        <ErrorState message={daily.problem.message} onRetry={daily.reload} />
      )}
      {!!d && (
        <>
          <Panel>
            <Text
              text={translate("reports.daily")}
              size="xs"
              style={{ color: theme.colors.textDim }}
            />
            <Text text={rupees(d.collectedPaise)} style={[$big, { color: theme.colors.text }]} />
            <View style={$pills}>
              {d.collections.map((c) => (
                <Chip
                  key={c.mode}
                  tone="brand"
                  text={`${translateOr(`option.${c.mode}`, c.mode.toUpperCase())} ${rupees(c.amount)} · ${c.count}`}
                />
              ))}
            </View>
          </Panel>
          <View style={$tiles}>
            <StatTile
              label={translate("reports.occupancy")}
              value={percent(d.occupancyPct)}
              hint={`${d.occupiedUnits}/${d.sellableUnits}`}
              style={$tile}
            />
            <StatTile
              label={translate("reports.arrivals")}
              value={d.arrivals}
              tone="teal"
              hint={`${translate("state.no_show")} ${d.noShows}`}
              style={$tile}
            />
            <StatTile
              label={translate("reports.departures")}
              value={d.departures}
              tone="violet"
              style={$tile}
            />
            <StatTile
              label={translate("reports.outstanding")}
              value={rupees(d.outstandingPaise)}
              tone={d.outstandingPaise > 0 ? "danger" : "ok"}
              hint={String(d.outstandingCount)}
              style={$tile}
            />
          </View>
          <Disclosure
            title={translate("reports.cash")}
            summary={rupees((cash.data ?? []).reduce((s, c) => s + c.cash_paise, 0))}
          >
            {(cash.data ?? []).map((c) => (
              <ListRow
                key={c.user_id}
                title={c.name}
                subtitle={c.last_handover_at ? formatDateTime(c.last_handover_at) : "—"}
                right={
                  <View style={$right}>
                    <Text text={rupees(c.cash_paise)} weight="bold" />
                    {can("MANAGER") && c.cash_paise > 0 && (
                      <Button
                        preset="secondary"
                        size="sm"
                        text={translate("action.handOver")}
                        onPress={() => void handover(c.user_id)}
                      />
                    )}
                  </View>
                }
                chevron={false}
                last
              />
            ))}
          </Disclosure>
          <Disclosure
            title={translate("reports.outstanding")}
            summary={`${outstanding.data?.length ?? 0}`}
          >
            <ListCard>
              {(outstanding.data ?? []).map((o, i) => (
                <ListRow
                  key={o.folio_id}
                  title={o.guest_name}
                  subtitle={`${o.phone} · ${formatDate(o.arrive_at)}`}
                  right={<Chip tone="danger" text={rupees(o.due_paise)} />}
                  onPress={() => navigation.navigate("Stay", { id: o.booking_id })}
                  last={i === (outstanding.data?.length ?? 0) - 1}
                />
              ))}
            </ListCard>
          </Disclosure>
          {d.depositsHeldPaise > 0 && (
            <KV label={translate("stay.deposit")} value={rupees(d.depositsHeldPaise)} />
          )}
        </>
      )}
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={translate("reports.exports")}
        items={[
          { label: translate("period.title"), onPress: () => navigation.navigate("PeriodReport") },
          ...(can("MANAGER")
            ? [
                {
                  label: translate("action.sendNow"),
                  onPress: () =>
                    void api.reports
                      .sendDaily()
                      .then((r) =>
                        r.ok ? showToast(translate("action.done"), "ok") : showError(r.problem),
                      ),
                },
              ]
            : []),
          ...(can("MANAGER") && d
            ? [
                {
                  label: `${translate("reports.register")} (CSV)`,
                  onPress: () =>
                    void exportCsv("guest-register.csv", () =>
                      api.reports.policeRegisterCsv(addDays(d.businessDate, -7), d.businessDate),
                    ),
                },
              ]
            : []),
          {
            label: `${translate("reports.month")} (CSV)`,
            onPress: () => void exportCsv("month.csv", () => api.reports.monthCsv()),
          },
        ]}
      />
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $big: TextStyle = { fontSize: 34, fontWeight: "800", letterSpacing: -1 }
const $pills: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $tiles: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $tile: ViewStyle = { flexBasis: "47%", flexGrow: 1 }
const $right: ViewStyle = { alignItems: "flex-end", gap: 4 }
