import { useState } from "react"

import { Button, ChoiceChips, Input, MoneyInput, Sheet, Switch, showError } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { toPaise } from "@/utils/format"

import type { RoomType } from "../types"

/** Add or edit a room type: name, rate, extra person, dormitory + beds or max guests, amenities. */
export function RoomTypeSheet({
  type,
  onClose,
  onDone,
}: {
  type: RoomType | null
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(type?.name ?? "")
  const [rate, setRate] = useState(type ? String(type.baseRatePaise / 100) : "")
  const [extra, setExtra] = useState(type ? String(type.extraPersonPaise / 100) : "")
  const [dormitory, setDormitory] = useState(type?.dormitory ?? false)
  const [amenities, setAmenities] = useState(type?.amenities.join(", ") ?? "")
  const [count, setCount] = useState(
    String(type ? (type.dormitory ? type.bedCount : type.maxOccupancy) : 2),
  )
  const [active, setActive] = useState(type?.active ?? true)
  const submit = async () => {
    const n = Math.max(1, parseInt(count, 10) || 1)
    const body = {
      name: name.trim(),
      baseRatePaise: toPaise(rate),
      maxOccupancy: dormitory ? 1 : n,
      extraPersonPaise: toPaise(extra),
      dormitory,
      bedCount: dormitory ? n : 0,
      sortOrder: type?.sortOrder ?? 0,
      active,
      amenities: amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    }
    const r = type
      ? await api.rooms.updateRoomType(type.id, body)
      : await api.rooms.createRoomType(body)
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={type ? translate("setup.editRoomType") : translate("setup.addRoomType")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!name.trim() || toPaise(rate) <= 0}
        />
      }
    >
      <Input label={translate("setup.name")} value={name} onChangeText={setName} autoFocus />
      <MoneyInput label={translate("setup.rate")} value={rate} onChangeText={setRate} />
      <MoneyInput label={translate("setup.extraPerson")} value={extra} onChangeText={setExtra} />
      <Switch
        value={dormitory}
        onValueChange={setDormitory}
        disabled={!!type}
        label={translate("setup.isDormitory")}
        labelPosition="right"
      />
      <Input
        label={dormitory ? translate("setup.bedCount") : translate("setup.maxOccupancy")}
        value={count}
        onChangeText={(t) => setCount(t.replace(/\D/g, ""))}
        keyboardType="number-pad"
      />
      <Input
        label={translate("setup.amenities")}
        hint={translate("setup.amenitiesHint")}
        value={amenities}
        onChangeText={setAmenities}
      />
      {!!type && (
        <Switch
          value={active}
          onValueChange={setActive}
          label={translate("setup.roomInUse")}
          labelPosition="right"
        />
      )}
    </Sheet>
  )
}

/** Add rooms from a number range. */
export function AddRoomsSheet({
  types,
  onClose,
  onDone,
}: {
  types: RoomType[]
  onClose: () => void
  onDone: () => void
}) {
  const [roomTypeId, setRoomTypeId] = useState<string | null>(types[0]?.id ?? null)
  const [range, setRange] = useState("")
  const [floor, setFloor] = useState("1")
  const [building, setBuilding] = useState("")
  const submit = async () => {
    if (!roomTypeId) return
    const r = await api.rooms.createRoomsBulk({
      roomTypeId,
      range: range.trim(),
      floor: parseInt(floor, 10) || 0,
      building: building.trim(),
    })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("setup.addRooms")}
      footer={
        <Button
          size="lg"
          text={translate("action.add")}
          onPress={submit}
          disabled={!roomTypeId || !range.trim()}
        />
      }
    >
      <ChoiceChips
        value={roomTypeId}
        onChange={setRoomTypeId}
        options={types.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))}
      />
      <Input
        label={translate("setup.range")}
        hint={translate("setup.rangeHint")}
        value={range}
        onChangeText={setRange}
        autoFocus
      />
      <Input
        label={translate("setup.floorNumber")}
        value={floor}
        onChangeText={(t) => setFloor(t.replace(/\D/g, ""))}
        keyboardType="number-pad"
      />
      <Input
        label={translate("setup.building")}
        hint={translate("setup.buildingHint")}
        value={building}
        onChangeText={setBuilding}
      />
    </Sheet>
  )
}
