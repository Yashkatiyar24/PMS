import { useState } from "react"

import { Button, DateField, Sheet, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { today } from "@/utils/date"

import type { Lane } from "../lib/tapeChart"
import type { MoveInput, TapeOccupancy } from "../types"

export type MoveStaySheetProps = {
  occupancy: TapeOccupancy | null
  lanes: Lane[]
  onClose: () => void
  onMove: (bookingId: string, body: MoveInput) => void
}

/** The phone's version of drag-and-drop: pick a new room/bed and (for reservations) a new arrival date. */
export function MoveStaySheet({ occupancy, lanes, onClose, onMove }: MoveStaySheetProps) {
  const { theme } = useAppTheme()
  const [arriveOn, setArriveOn] = useState(occupancy?.arrive_at.slice(0, 10) ?? today())
  const [target, setTarget] = useState<Lane | null>(null)
  if (!occupancy) return null
  const canMoveDates = occupancy.state === "reserved" || occupancy.state === "pending"
  const others = lanes.filter((l) => !l.offSale && l.key !== occupancy.unit_id)
  const submit = () =>
    onMove(occupancy.booking_id, {
      unitId: occupancy.unit_id,
      roomId: target ? target.unit.room_id : null,
      bedId: target ? target.unit.bed_id : null,
      arriveOn: canMoveDates && arriveOn !== occupancy.arrive_at.slice(0, 10) ? arriveOn : null,
    })
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("mobile.moveStay")}
      description={occupancy.guest_name}
      footer={
        <Button
          size="lg"
          text={translate("mobile.moveStay")}
          onPress={submit}
          disabled={!target && (!canMoveDates || arriveOn === occupancy.arrive_at.slice(0, 10))}
        />
      }
    >
      {!!canMoveDates && (
        <DateField
          label={translate("mobile.newArrival")}
          value={arriveOn}
          min={today()}
          onChange={setArriveOn}
        />
      )}
      <Text
        text={translate("mobile.newUnit")}
        size="xs"
        weight="bold"
        style={{ color: theme.colors.text }}
      />
      <Button
        preset={target ? "secondary" : "primary"}
        size="sm"
        text={translate("mobile.keepUnit")}
        onPress={() => setTarget(null)}
      />
      {others.map((l) => (
        <Button
          key={l.key}
          preset={target?.key === l.key ? "primary" : "secondary"}
          size="sm"
          text={`${l.label} · ${l.unit.type_name}`}
          onPress={() => setTarget(l)}
        />
      ))}
    </Sheet>
  )
}
