import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  afterSheetCloses,
  Banner,
  Button,
  Chip,
  ChoiceChips,
  Disclosure,
  Input,
  ListRow,
  Sheet,
  Text,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { useAppTheme } from "@/theme/context"
import { formatDate } from "@/utils/date"

import { nextStatuses, statusTone } from "../lib/roomLabels"
import type { HkPriority, HousekeepingInput, Person, Room, RoomStatus } from "../types"

export type RoomSheetProps = {
  room: Room
  housekeepers: Person[]
  onClose: () => void
  onStatus: (status: RoomStatus, reason: string | null) => void
  onHousekeeping: (body: HousekeepingInput) => void
  onReport: () => void
}

/** A room's status, who is in it, block/maintenance with reason, report a problem, housekeeping assignment. */
export function RoomSheet({
  room,
  housekeepers,
  onClose,
  onStatus,
  onHousekeeping,
  onReport,
}: RoomSheetProps) {
  const { theme } = useAppTheme()
  const { has } = usePermission()
  const navigation = useAppNavigation()
  const [blocking, setBlocking] = useState<"blocked" | "maintenance" | null>(null)
  const [reason, setReason] = useState("")
  const [hk, setHk] = useState<HousekeepingInput>({
    housekeeperId: room.housekeeperId,
    priority: room.hkPriority,
    note: room.hkNote,
  })
  const canStatus = has("housekeeping") || has("maintenance")

  const occupancyRows =
    room.beds.length > 0
      ? room.beds.filter((b) => b.active).map((b) => ({ label: b.label, occ: b.occupancy }))
      : [{ label: room.number, occ: room.occupancy }]

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${translate("nav.rooms")} ${room.number}`}
      description={`${room.roomTypeName}${room.building ? ` · ${room.building}` : ""} · ${translate("rooms.floor", { n: room.floor })}`}
    >
      <View style={$row}>
        <Chip
          tone={statusTone(room.status)}
          text={translateOr(`rooms.status.${room.status}`, room.status)}
          dot
        />
        {!!room.blockedReason && (
          <Text text={room.blockedReason} size="xs" style={{ color: theme.colors.textDim }} />
        )}
      </View>
      {!!room.hkNote && (
        <Banner tone={room.hkPriority === "high" ? "warn" : "info"} text={room.hkNote} />
      )}
      <View>
        {occupancyRows.map((r, i) => (
          <ListRow
            key={r.label}
            title={r.occ ? `${r.label} · ${r.occ.guestName}` : r.label}
            subtitle={
              r.occ
                ? `${translate("action.checkOut")} ${formatDate(r.occ.departAt)}`
                : translate("rooms.available")
            }
            right={
              r.occ ? (
                <Chip
                  tone={r.occ.state === "occupied" ? "ok" : "brand"}
                  text={
                    r.occ.state === "occupied"
                      ? translate("rooms.occupied")
                      : translate("rooms.reserved")
                  }
                />
              ) : undefined
            }
            onPress={
              r.occ && has("reservations.view")
                ? () => {
                    const id = r.occ!.bookingId
                    onClose()
                    afterSheetCloses(() => navigation.navigate("Stay", { id }))
                  }
                : undefined
            }
            last={i === occupancyRows.length - 1}
          />
        ))}
      </View>
      {!!canStatus && (
        <View style={$actions}>
          {nextStatuses(room.status).map((n, i) => (
            <Button
              key={n.to}
              preset={i === 0 ? "primary" : "secondary"}
              icon={i === 0 ? "check" : undefined}
              size={i === 0 ? "md" : "sm"}
              style={i === 0 ? $primaryAction : undefined}
              text={translate(n.label as "rooms.markClean")}
              onPress={() => onStatus(n.to, null)}
            />
          ))}
          {room.status !== "blocked" && room.status !== "maintenance" && (
            <>
              <Button
                preset="ghost"
                size="sm"
                text={translate("rooms.block")}
                onPress={() => setBlocking("blocked")}
              />
              <Button
                preset="ghost"
                size="sm"
                text={translate("rooms.maintenance")}
                onPress={() => setBlocking("maintenance")}
              />
            </>
          )}
        </View>
      )}
      {!!blocking && (
        <View style={$block}>
          <Input
            label={
              blocking === "blocked"
                ? translate("rooms.blockReason")
                : translate("rooms.maintenanceReason")
            }
            value={reason}
            onChangeText={setReason}
            autoFocus
          />
          <Button
            preset="danger"
            text={
              blocking === "blocked" ? translate("rooms.block") : translate("rooms.maintenance")
            }
            disabled={!reason.trim()}
            onPress={() => onStatus(blocking, reason.trim())}
          />
        </View>
      )}
      {has("maintenance.report") && (
        <Button preset="secondary" text={translate("maint.report")} onPress={onReport} />
      )}
      {has("housekeeping") && (
        <Disclosure
          title={translate("rooms.assign")}
          summary={room.housekeeperName ?? translate("rooms.unassigned")}
        >
          <ChoiceChips<string>
            value={hk.housekeeperId ?? "none"}
            onChange={(v) => setHk((h) => ({ ...h, housekeeperId: v === "none" ? null : v }))}
            options={[
              { value: "none", label: translate("rooms.unassigned") },
              ...housekeepers.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <ChoiceChips<HkPriority>
            value={hk.priority}
            onChange={(priority) => setHk((h) => ({ ...h, priority }))}
            options={(["low", "normal", "high"] as HkPriority[]).map((p) => ({
              value: p,
              label: translateOr(`priority.${p}`, p),
            }))}
          />
          <Input
            label={translate("rooms.note")}
            value={hk.note}
            onChangeText={(note) => setHk((h) => ({ ...h, note: note.slice(0, 300) }))}
            maxLength={300}
          />
          <Button text={translate("action.save")} onPress={() => onHousekeeping(hk)} />
        </Disclosure>
      )}
    </Sheet>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }
const $actions: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $primaryAction: ViewStyle = { flexBasis: "100%" }
const $block: ViewStyle = { gap: 8 }
