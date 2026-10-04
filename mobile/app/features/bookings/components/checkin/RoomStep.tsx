import { useMemo } from "react"
import { View } from "react-native"

import { ChoiceChips, Panel, SectionLabel, Stepper } from "@/components"
import { OFF_SALE, type Room, type RoomType } from "@/features/rooms/types"
import { translate } from "@/i18n/translate"
import { rupees, unitName } from "@/utils/format"

import type { CheckInForm } from "../../hooks/useCheckInForm"
import type { FreeUnit } from "../../types"
import { UnitPicker } from "../UnitPicker"

export type RoomStepProps = {
  form: CheckInForm
  patch: (p: Partial<CheckInForm>) => void
  rooms: Room[]
  roomTypes: RoomType[]
}

/**
 * Step 2 of a walk-in: party size, nights, room type, then a room or bed that is free right now. Built from the
 * rooms list (not the availability call) as on the web: active, on sale, and unoccupied.
 */
export function RoomStep({ form, patch, rooms, roomTypes }: RoomStepProps) {
  const free = useMemo(() => freeNow(rooms, roomTypes), [rooms, roomTypes])
  const typesWithFree = roomTypes.filter((t) => t.active && free.some((u) => u.roomTypeId === t.id))
  return (
    <View>
      <SectionLabel text={`2 · ${translate("checkin.stepRoom")}`} />
      <Panel>
        <Stepper
          label={translate("checkin.adults")}
          value={form.adults}
          min={1}
          onChange={(adults) => patch({ adults })}
        />
        <Stepper
          label={translate("checkin.children")}
          value={form.children}
          onChange={(children) => patch({ children })}
        />
        <Stepper
          label={translate("checkin.nights")}
          value={form.nights}
          min={1}
          max={60}
          onChange={(nights) => patch({ nights })}
        />
        <ChoiceChips
          value={form.roomTypeId}
          onChange={(roomTypeId) => patch({ roomTypeId, unit: null, unitLabel: "" })}
          options={typesWithFree.map((t) => ({
            value: t.id,
            label: `${t.name} · ${rupees(t.baseRatePaise)}`,
          }))}
        />
        {!!form.roomTypeId && (
          <UnitPicker
            units={free}
            roomTypeIds={[form.roomTypeId]}
            selected={form.unit ? [form.unit] : []}
            onToggle={(u) =>
              patch({
                unit: { roomId: u.roomId, bedId: u.bedId, ratePaise: null },
                unitLabel: unitName(u.roomNumber, u.bedLabel),
              })
            }
          />
        )}
      </Panel>
    </View>
  )
}

/** Rooms and dormitory beds free tonight, shaped like the availability call's FreeUnit. */
export function freeNow(rooms: Room[], roomTypes: RoomType[]): FreeUnit[] {
  const out: FreeUnit[] = []
  for (const room of rooms) {
    if (!room.active || OFF_SALE.includes(room.status)) continue
    const type = roomTypes.find((t) => t.id === room.roomTypeId)
    if (!type || !type.active) continue
    const base = {
      roomId: room.id,
      roomNumber: room.number,
      roomTypeId: type.id,
      typeName: type.name,
      ratePaise: type.baseRatePaise,
      dormitory: type.dormitory,
      status: room.status,
      building: room.building,
      floor: room.floor,
    }
    if (type.dormitory) {
      for (const bed of room.beds)
        if (bed.active && !bed.occupancy) out.push({ ...base, bedId: bed.id, bedLabel: bed.label })
    } else if (!room.occupancy) out.push({ ...base, bedId: null, bedLabel: null })
  }
  return out
}

/** The nightly rate of the picked unit, for the total the desk collects. */
export function rateFor(form: CheckInForm, roomTypes: RoomType[]): number {
  return roomTypes.find((t) => t.id === form.roomTypeId)?.baseRatePaise ?? 0
}
