import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button, ChoiceChips, Input, Sheet, Switch, Text, showError } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"

import type { Room, RoomType } from "../types"

/** Edit one room; for a dormitory, add beds and toggle them in or out of use. */
export function RoomEditSheet({
  room,
  types,
  onClose,
  onChanged,
  onDone,
}: {
  room: Room
  types: RoomType[]
  onClose: () => void
  onChanged: (room: Room) => void
  onDone: () => void
}) {
  const { theme } = useAppTheme()
  const [number, setNumber] = useState(room.number)
  const [floor, setFloor] = useState(String(room.floor))
  const [building, setBuilding] = useState(room.building)
  const [roomTypeId, setRoomTypeId] = useState(room.roomTypeId)
  const [active, setActive] = useState(room.active)
  const [bedLabel, setBedLabel] = useState("")
  const isDorm = types.find((t) => t.id === room.roomTypeId)?.dormitory ?? false
  const submit = async () => {
    const r = await api.rooms.updateRoom(room.id, {
      roomTypeId,
      number: number.trim(),
      floor: parseInt(floor, 10) || 0,
      active,
      building: building.trim(),
    })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  const bed = async (
    call: () => Promise<
      { ok: true; data: Room } | { ok: false; problem: import("@/services/api").ApiProblem }
    >,
  ) => {
    const r = await call()
    if (!r.ok) return showError(r.problem)
    onChanged(r.data)
    setBedLabel("")
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${translate("setup.roomNumber")} ${room.number}`}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!number.trim()}
        />
      }
    >
      <Input label={translate("setup.roomNumber")} value={number} onChangeText={setNumber} />
      <Input
        label={translate("setup.floorNumber")}
        value={floor}
        onChangeText={(t) => setFloor(t.replace(/\D/g, ""))}
        keyboardType="number-pad"
      />
      <Input label={translate("setup.building")} value={building} onChangeText={setBuilding} />
      <ChoiceChips
        value={roomTypeId}
        onChange={setRoomTypeId}
        disabled={isDorm}
        options={types
          .filter((t) => t.dormitory === isDorm)
          .map((t) => ({ value: t.id, label: t.name }))}
      />
      <Switch
        value={active}
        onValueChange={setActive}
        label={translate("setup.roomInUse")}
        labelPosition="right"
      />
      {!!isDorm && (
        <>
          <Text
            text={translate("setup.beds")}
            size="xs"
            weight="bold"
            style={{ color: theme.colors.text }}
          />
          <View style={$beds}>
            {room.beds.map((b) => (
              <Button
                key={b.id}
                preset={b.active ? "secondary" : "ghost"}
                size="sm"
                text={b.label}
                accessibilityLabel={b.active ? translate("setup.bedOff") : translate("setup.bedOn")}
                onPress={() => void bed(() => api.rooms.setBedActive(b.id, !b.active))}
              />
            ))}
          </View>
          <View style={$addBed}>
            <View style={$grow}>
              <Input value={bedLabel} onChangeText={setBedLabel} placeholder="B5" />
            </View>
            <Button
              preset="secondary"
              size="sm"
              text={translate("setup.addBed")}
              onPress={() => void bed(() => api.rooms.addBed(room.id, bedLabel.trim() || null))}
            />
          </View>
        </>
      )}
    </Sheet>
  )
}

const $beds: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $addBed: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
const $grow: ViewStyle = { flex: 1 }
