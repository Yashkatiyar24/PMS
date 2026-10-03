import { useMemo, useState } from "react"
import { View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Button,
  Chip,
  DateField,
  ErrorState,
  Loading,
  PageHeader,
  Screen,
  Text,
  showError,
  showToast,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { OfflineBar } from "@/features/offline/components/OfflineBar"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { addDays, today } from "@/utils/date"

import { MoveStaySheet } from "../components/MoveStaySheet"
import { TapeGrid } from "../components/TapeGrid"
import { chartDays, dayLoad, groupLanes, type Bar, type Lane } from "../lib/tapeChart"
import type { TapeOccupancy } from "../types"

/** The calendar: every unit against the coming days; tap a stay to open it, long-press to move it, tap a gap to book. */
export const TapeChartScreen = observer(function TapeChartScreen() {
  const navigation = useAppNavigation()
  const { theme } = useAppTheme()
  const { has } = usePermission()
  const [start, setStart] = useState<string | undefined>(undefined)
  const [moving, setMoving] = useState<TapeOccupancy | null>(null)
  const chart = useResource(() => api.bookings.tapeChart(start), [start], {
    cacheKey: `tape.${start ?? "today"}`,
    refreshMs: 60_000,
  })
  const c = chart.data
  const groups = useMemo(() => (c ? groupLanes(c) : []), [c])
  const days = useMemo(() => (c ? chartDays(c) : []), [c])
  const load = useMemo(() => (c ? dayLoad(c, groups) : []), [c, groups])
  const lanes = groups.flatMap((g) => g.lanes)

  const onCell = (lane: Lane, day: string) => {
    if (!has("reservations.create")) return
    if (day < today()) return
    const unit = { roomId: lane.unit.room_id, bedId: lane.unit.bed_id ?? undefined }
    if (day === today()) navigation.navigate("CheckIn", unit)
    else navigation.navigate("NewBooking", { ...unit, date: day })
  }

  const move = async (bookingId: string, body: Parameters<typeof api.bookings.move>[1]) => {
    const result = await api.bookings.move(bookingId, body)
    setMoving(null)
    if (!result.ok) return showError(result.problem)
    showToast(translate("cal.moved"), "ok")
    void chart.reload()
  }

  const shift = (n: number) => setStart(addDays(start ?? c?.start ?? today(), n))
  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <AppHeader />
      <OfflineBar />
      <PageHeader
        title={translate("nav.bookings")}
        actions={
          has("reservations.create") ? (
            <Button
              size="sm"
              text={translate("action.newBooking")}
              onPress={() => navigation.navigate("NewBooking")}
            />
          ) : undefined
        }
      />
      <View style={$pager}>
        <Button
          preset="secondary"
          size="sm"
          text={translate("cal.earlier")}
          onPress={() => shift(-(c?.days ?? 14))}
        />
        <Button
          preset="secondary"
          size="sm"
          text={translate("common.today")}
          onPress={() => setStart(undefined)}
        />
        <Button
          preset="secondary"
          size="sm"
          text={translate("cal.later")}
          onPress={() => shift(c?.days ?? 14)}
        />
        <View style={$date}>
          <DateField label="" value={start ?? c?.start ?? today()} onChange={setStart} />
        </View>
      </View>
      <View style={$legend}>
        <Chip tone="brand" text={translate("state.reserved")} dot />
        <Chip tone="ok" text={translate("state.checked_in")} dot />
        <Chip tone="neutral" text={translate("state.checked_out")} dot />
        <Chip tone="danger" text={translate("rooms.status.blocked")} dot />
      </View>
      <Text
        text={translate("mobile.longPressHint")}
        size="xxs"
        style={{ color: theme.colors.textFaint }}
      />
      {!!chart.loading && <Loading />}
      {!!chart.problem && !c && (
        <ErrorState message={chart.problem.message} onRetry={chart.reload} />
      )}
      {!!c && (
        <View
          style={[
            $grid,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <TapeGrid
            days={days}
            groups={groups}
            load={load}
            onBar={(b: Bar) => navigation.navigate("Stay", { id: b.occupancy.booking_id })}
            onLongBar={(b: Bar) =>
              has("reservations.edit") &&
              (b.occupancy.state === "reserved" ||
                b.occupancy.state === "pending" ||
                b.occupancy.state === "checked_in") &&
              setMoving(b.occupancy)
            }
            onCell={onCell}
          />
        </View>
      )}
      {!!moving && (
        <MoveStaySheet
          occupancy={moving}
          lanes={lanes}
          onClose={() => setMoving(null)}
          onMove={move}
        />
      )}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 10, paddingBottom: 32 }
const $pager: ViewStyle = { flexDirection: "row", alignItems: "flex-end", gap: 6 }
const $date: ViewStyle = { flex: 1 }
const $legend: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $grid: ViewStyle = { borderWidth: 1, borderRadius: 12, overflow: "hidden" }
