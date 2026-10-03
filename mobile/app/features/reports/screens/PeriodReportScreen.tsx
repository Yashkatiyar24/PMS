import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Button,
  DateField,
  ErrorState,
  Loading,
  PageHeader,
  Screen,
  Segmented,
  StatTile,
  showError,
  showToast,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { shareText } from "@/utils/files"
import { percent, rupees } from "@/utils/format"

import { MoneySections, OperationsSections } from "../components/PeriodSections"
import { RANGE_KEYS, rangeFor, type RangeKey } from "../lib/ranges"

/** Everything about a date range: occupancy, revenue, bookings, sources, payments, GST, expenses, housekeeping, maintenance, guests. */
export function PeriodReportScreen() {
  const navigation = useAppNavigation()
  const [key, setKey] = useState<RangeKey>("today")
  const [custom, setCustom] = useState(rangeFor("today"))
  const range = key === "custom" ? custom : rangeFor(key)
  const report = useResource(
    () => api.reports.period(range.from, range.to),
    [range.from, range.to],
    { cacheKey: `period.${range.from}.${range.to}` },
  )
  const online = useResource(
    () => api.reports.onlinePayments(range.from, range.to),
    [range.from, range.to],
  )
  const r = report.data

  const csv = async () => {
    const res = await api.reports.periodCsv(range.from, range.to)
    if (!res.ok) return showError(res.problem)
    await shareText(`report-${range.from}-${range.to}.csv`, res.data)
  }
  const check = async (id: string) => {
    const res = await api.reports.checkOnlinePayment(id)
    if (!res.ok) return showError(res.problem)
    showToast(translateOr(`period.order.${res.data.status}`, res.data.status), "ok")
    void online.reload()
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("period.title")}
        onBack={() => navigation.goBack()}
        actions={<Button preset="secondary" size="sm" text="CSV" onPress={csv} />}
      />
      <Segmented<RangeKey>
        scroll
        value={key}
        onChange={setKey}
        items={RANGE_KEYS.map((k) => ({
          value: k,
          label: translate(`period.${k}` as "period.today"),
        }))}
      />
      {key === "custom" && (
        <View style={$dates}>
          <View style={$half}>
            <DateField
              label={translate("period.from")}
              value={custom.from}
              max={custom.to}
              onChange={(from) => setCustom((c) => ({ ...c, from }))}
            />
          </View>
          <View style={$half}>
            <DateField
              label={translate("period.to")}
              value={custom.to}
              min={custom.from}
              onChange={(to) => setCustom((c) => ({ ...c, to }))}
            />
          </View>
        </View>
      )}
      {!!report.loading && <Loading />}
      {!!report.problem && !r && (
        <ErrorState message={report.problem.message} onRetry={report.reload} />
      )}
      {!!r && (
        <>
          <View style={$tiles}>
            <StatTile
              label={translate("reports.occupancy")}
              value={percent(r.occupancy.occupancyPct)}
              hint={`${r.occupancy.nightsSold}/${r.occupancy.availableNights}`}
              style={$tile}
            />
            <StatTile label="ADR" value={rupees(r.occupancy.adrPaise)} tone="teal" style={$tile} />
            <StatTile
              label="RevPAR"
              value={rupees(r.occupancy.revparPaise)}
              tone="violet"
              style={$tile}
            />
            <StatTile
              label={translate("period.revenue")}
              value={rupees(r.revenue.totalPaise)}
              tone="ok"
              style={$tile}
            />
            <StatTile
              label={translate("expense.title")}
              value={rupees(r.expenses.totalPaise)}
              tone="warn"
              style={$tile}
            />
            <StatTile
              label={translate("period.net")}
              value={rupees(r.net.netPaise)}
              tone={r.net.netPaise < 0 ? "danger" : "ok"}
              style={$tile}
            />
          </View>
          <MoneySections r={r} online={online.data} onCheck={(id) => void check(id)} />
          <OperationsSections r={r} />
        </>
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $dates: ViewStyle = { flexDirection: "row", gap: 8 }
const $half: ViewStyle = { flex: 1 }
const $tiles: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $tile: ViewStyle = { flexBasis: "47%", flexGrow: 1 }
