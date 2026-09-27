import { useState } from "react"
import { RefreshControl, View, type ViewStyle } from "react-native"

import {
  Avatar,
  Button,
  Chip,
  Empty,
  ErrorState,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import type { Tone } from "@/theme/tones"
import { formatDateTime } from "@/utils/date"

import { ReportIssueSheet } from "../components/ReportIssueSheet"
import { TicketSheet } from "../components/TicketSheet"
import type { Ticket, TicketPriority } from "../types"

const PRIORITY_TONE: Record<TicketPriority, Tone> = {
  low: "neutral",
  normal: "brand",
  high: "warn",
  urgent: "danger",
}

/** Repair tickets: open or all; technicians work them, everyone with the permission reports. */
export function MaintenanceScreen() {
  const navigation = useAppNavigation()
  const { has } = usePermission()
  const works = has("maintenance")
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<Ticket | null>(null)
  const [reporting, setReporting] = useState(false)
  const [pickRoom, setPickRoom] = useState<{ id: string | null; number?: string } | null>(null)
  const tickets = useResource(() => api.maintenance.tickets(all), [all], {
    cacheKey: `tickets.${all}`,
    refreshMs: 30_000,
  })
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms" })
  const technicians = useResource(() => api.maintenance.technicians(), [], {
    cacheKey: "technicians",
    enabled: works,
  })
  const list = tickets.data ?? []
  const openCount = list.filter((t) => t.status !== "resolved" && t.status !== "closed").length

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: (
          <RefreshControl refreshing={tickets.refreshing} onRefresh={tickets.reload} />
        ),
      }}
    >
      <PageHeader
        title={translate("maint.title")}
        subtitle={`${openCount} ${translate("maint.openCount")}`}
        onBack={() => navigation.goBack()}
        actions={
          has("maintenance.report") ? (
            <Button size="sm" text={translate("maint.report")} onPress={() => setReporting(true)} />
          ) : undefined
        }
      />
      <Segmented<"open" | "all">
        value={all ? "all" : "open"}
        onChange={(v) => setAll(v === "all")}
        items={[
          { value: "open", label: translate("maint.status.open") },
          { value: "all", label: translate("common.all") },
        ]}
      />
      {!!tickets.loading && <Loading />}
      {!!tickets.problem && !tickets.data && (
        <ErrorState message={tickets.problem.message} onRetry={tickets.reload} />
      )}
      {!!tickets.data && list.length === 0 && <Empty text={translate("empty.maintenance")} />}
      {list.length > 0 && (
        <ListCard>
          {list.map((t, i) => (
            <ListRow
              key={t.id}
              leading={<Avatar glyph="🔧" tone={PRIORITY_TONE[t.priority]} />}
              title={`${t.roomNumber ?? translate("maint.noRoom")} · ${t.issue}`}
              subtitle={`${formatDateTime(t.createdAt)}${t.assignedName ? ` · ${t.assignedName}` : ""}`}
              right={
                <Chip
                  tone={
                    t.status === "resolved" || t.status === "closed"
                      ? "ok"
                      : t.status === "open"
                        ? "warn"
                        : "brand"
                  }
                  text={translateOr(`maint.status.${t.status}`, t.status)}
                />
              }
              onPress={() => setOpen(t)}
              last={i === list.length - 1}
            />
          ))}
        </ListCard>
      )}
      {!!open && (
        <TicketSheet
          ticket={open}
          works={works}
          technicians={technicians.data ?? []}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            void tickets.reload()
          }}
        />
      )}
      <Sheet
        open={!!reporting && !pickRoom}
        onClose={() => setReporting(false)}
        title={translate("maint.report")}
        description={translate("res.col.room")}
      >
        <View style={$rooms}>
          <Button
            preset="secondary"
            size="sm"
            text={translate("maint.noRoom")}
            onPress={() => setPickRoom({ id: null })}
          />
          {(rooms.data ?? []).map((r) => (
            <Button
              key={r.id}
              preset="secondary"
              size="sm"
              text={r.number}
              onPress={() => setPickRoom({ id: r.id, number: r.number })}
            />
          ))}
        </View>
      </Sheet>
      {!!pickRoom && (
        <ReportIssueSheet
          roomId={pickRoom.id}
          roomNumber={pickRoom.number}
          onClose={() => {
            setPickRoom(null)
            setReporting(false)
          }}
          onDone={() => void tickets.reload()}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $rooms: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
