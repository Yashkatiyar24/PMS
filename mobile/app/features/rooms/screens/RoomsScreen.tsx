import { useState } from "react"
import { RefreshControl, View, type TextStyle, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  ActionSheet,
  Button,
  ErrorState,
  Loading,
  PageHeader,
  Screen,
  SectionLabel,
  Segmented,
  StaleLabel,
  Text,
  showError,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { ReportIssueSheet } from "@/features/maintenance/components/ReportIssueSheet"
import { OfflineBar } from "@/features/offline/components/OfflineBar"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"

import { RoomSheet } from "../components/RoomSheet"
import { RoomTile } from "../components/RoomTile"
import { filterRooms, groupRooms, statusBucket, type RoomFilter } from "../lib/roomLabels"
import type { HousekeepingInput, Room, RoomStatus } from "../types"

/** Housekeeping's board: every room by building and floor, filtered; tap for status and assignment. */
export const RoomsScreen = observer(function RoomsScreen() {
  const navigation = useAppNavigation()
  const { has, user } = usePermission()
  const [filter, setFilter] = useState<RoomFilter>("all")
  const [open, setOpen] = useState<Room | null>(null)
  const [reporting, setReporting] = useState<Room | null>(null)
  const [menu, setMenu] = useState(false)
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms", refreshMs: 30_000 })
  const housekeepers = useResource(() => api.rooms.housekeepers(), [], {
    cacheKey: "housekeepers",
    enabled: has("housekeeping"),
  })
  const list = rooms.data ?? []
  const counts = {
    clean: list.filter((r) => statusBucket(r.status) === "clean").length,
    dirty: list.filter((r) => statusBucket(r.status) === "dirty").length,
    blocked: list.filter((r) => statusBucket(r.status) === "blocked").length,
  }
  const mine = list.some((r) => r.housekeeperId === user?.id)
  const shown = filterRooms(list, filter, user?.id ?? null)
  const current = open ? (list.find((r) => r.id === open.id) ?? open) : null

  /** Optimistic: paint the new status at once, put it back if the server refuses. */
  const setStatus = async (room: Room, status: RoomStatus, reason: string | null) => {
    rooms.set((rs) =>
      rs.map((r) => (r.id === room.id ? { ...r, status, blockedReason: reason } : r)),
    )
    const result = await api.rooms.setStatus(room.id, { status, reason, until: null })
    if (!result.ok) {
      rooms.set((rs) => rs.map((r) => (r.id === room.id ? room : r)))
      showError(result.problem)
    } else setOpen(null)
    void rooms.reload()
  }
  const setHousekeeping = async (room: Room, body: HousekeepingInput) => {
    const result = await api.rooms.setHousekeeping(room.id, body)
    if (!result.ok) return showError(result.problem)
    setOpen(null)
    void rooms.reload()
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: <RefreshControl refreshing={rooms.refreshing} onRefresh={rooms.reload} />,
      }}
    >
      <AppHeader />
      <OfflineBar />
      <PageHeader
        title={translate("nav.rooms")}
        subtitle={translate("rooms.summary", counts)}
        actions={
          has("maintenance") || has("maintenance.report") || has("lost_found") ? (
            <Button
              preset="secondary"
              size="sm"
              icon="more"
              accessibilityLabel={translate("common.more")}
              onPress={() => setMenu(true)}
            />
          ) : undefined
        }
      />
      <Segmented<RoomFilter>
        scroll
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: translate("common.all"), count: list.length },
          ...(mine ? [{ value: "mine" as RoomFilter, label: translate("rooms.mine") }] : []),
          { value: "clean", label: translate("rooms.status.clean"), count: counts.clean },
          { value: "dirty", label: translate("rooms.status.dirty"), count: counts.dirty },
          { value: "blocked", label: translate("rooms.status.blocked"), count: counts.blocked },
        ]}
      />
      <Legend />
      {!!rooms.loading && <Loading />}
      {!!rooms.problem && !rooms.data && (
        <ErrorState message={rooms.problem.message} onRetry={rooms.reload} />
      )}
      {groupRooms(shown).map((g) => (
        <View key={g.key}>
          <SectionLabel text={g.title} />
          <View style={$grid}>
            {g.rooms.map((r) => (
              <RoomTile
                key={r.id}
                room={r}
                selected={open?.id === r.id}
                onPress={() => setOpen(r)}
              />
            ))}
          </View>
        </View>
      ))}
      {!!rooms.fromCache && <StaleLabel fetchedAt={rooms.fetchedAt} />}
      {!!current && !reporting && (
        <RoomSheet
          room={current}
          housekeepers={housekeepers.data ?? []}
          onClose={() => setOpen(null)}
          onStatus={(s, reason) => void setStatus(current, s, reason)}
          onHousekeeping={(b) => void setHousekeeping(current, b)}
          onReport={() => setReporting(current)}
        />
      )}
      {!!reporting && (
        <ReportIssueSheet
          roomId={reporting.id}
          roomNumber={reporting.number}
          onClose={() => setReporting(null)}
          onDone={() => {
            setOpen(null)
            void rooms.reload()
          }}
        />
      )}
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={translate("common.more")}
        items={[
          ...(has("maintenance") || has("maintenance.report")
            ? [
                {
                  label: translate("maint.title"),
                  onPress: () => navigation.navigate("Maintenance"),
                },
              ]
            : []),
          ...(has("lost_found")
            ? [{ label: translate("lost.title"), onPress: () => navigation.navigate("LostFound") }]
            : []),
        ]}
      />
    </Screen>
  )
})

/** What the chip fills mean — the reference's Dirty / Inspected / Clean / Out of service line, as small swatches. */
function Legend() {
  const { theme } = useAppTheme()
  const p = theme.colors.palette
  const entries: { fill: string; edge: string; label: string }[] = [
    { fill: p.dangerSoft, edge: p.danger, label: translate("rooms.status.dirty") },
    { fill: p.brandSoft, edge: p.brand, label: translate("rooms.status.inspected") },
    {
      fill: theme.colors.surface,
      edge: theme.colors.borderStrong,
      label: translate("rooms.status.clean"),
    },
    { fill: p.neutralSoft, edge: p.neutral, label: translate("rooms.status.blocked") },
  ]
  return (
    <View style={$legend}>
      {entries.map((e) => (
        <View key={e.label} style={$legendItem}>
          <View style={[$legendSwatch, { backgroundColor: e.fill, borderColor: e.edge }]} />
          <Text text={e.label} size="xxs" style={[$legendText, { color: theme.colors.textDim }]} />
        </View>
      ))}
    </View>
  )
}

const $content: ViewStyle = { padding: 16, gap: 8, paddingBottom: 32 }
const $grid: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 10 }
const $legend: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingVertical: 4 }
const $legendItem: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $legendSwatch: ViewStyle = { width: 12, height: 12, borderRadius: 4, borderWidth: 1 }
const $legendText: TextStyle = { fontWeight: "600", letterSpacing: 0.3 }
