import { useEffect, useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button, Input, Loading, Sheet, Switch, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { unitName } from "@/utils/format"

import type { Booking, BookingUnit, Details, FreeUnit, Member } from "../../../types"
import { UnitPicker } from "../../UnitPicker"

/** Group name, organisation, GSTIN, special requests, notes. */
export function EditDetailsSheet({
  open,
  onClose,
  booking,
  onDone,
}: {
  open: boolean
  onClose: () => void
  booking: Booking
  onDone: (details: Details, notes: string) => void
}) {
  const [groupName, setGroupName] = useState(booking.groupName ?? "")
  const [organization, setOrganization] = useState(booking.organization ?? "")
  const [gstin, setGstin] = useState(booking.billingGstin ?? "")
  const [requests, setRequests] = useState(booking.specialRequests ?? "")
  const [notes, setNotes] = useState(booking.notes ?? "")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("stay.editDetails")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={() =>
            onDone(
              {
                groupName: groupName.trim() || null,
                organization: organization.trim() || null,
                billingGstin: gstin.trim() || null,
                specialRequests: requests.trim() || null,
              },
              notes.trim(),
            )
          }
        />
      }
    >
      <Input label={translate("booking.groupName")} value={groupName} onChangeText={setGroupName} />
      <Input
        label={translate("booking.organization")}
        value={organization}
        onChangeText={setOrganization}
      />
      <Input
        label={translate("booking.billingGstin")}
        value={gstin}
        onChangeText={(t) => setGstin(t.toUpperCase().slice(0, 15))}
        autoCapitalize="characters"
        maxLength={15}
      />
      <Input
        label={translate("booking.specialRequests")}
        value={requests}
        onChangeText={setRequests}
        multiline
      />
      <Input label={translate("booking.notes")} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  )
}

/** The party: one row per person with the unit they sleep in and a child flag. */
export function PartySheet({
  open,
  onClose,
  booking,
  onDone,
}: {
  open: boolean
  onClose: () => void
  booking: Booking
  onDone: (members: Member[]) => void
}) {
  const { theme } = useAppTheme()
  const [members, setMembers] = useState<Member[]>(
    booking.members.length
      ? booking.members
      : [
          {
            id: null,
            name: booking.guestName,
            adult: true,
            idType: null,
            idLast4: null,
            unitId: booking.units[0]?.id ?? null,
          },
        ],
  )
  const update = (i: number, patch: Partial<Member>) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const units = booking.units.filter(
    (u) =>
      u.departAt >= booking.departAt || booking.state === "reserved" || booking.state === "pending",
  )
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("stay.party")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={() => onDone(members.filter((m) => m.name.trim()))}
        />
      }
    >
      {members.map((m, i) => (
        <View key={i} style={$member}>
          <Input
            label={translate("checkin.memberName")}
            value={m.name}
            onChangeText={(t) => update(i, { name: t })}
          />
          <View style={$unitRow}>
            {units.map((u) => (
              <Button
                key={u.id}
                preset={m.unitId === u.id ? "primary" : "secondary"}
                size="sm"
                text={unitName(u.roomNumber, u.bedLabel)}
                onPress={() => update(i, { unitId: u.id })}
              />
            ))}
            <Button
              preset={m.unitId === null ? "primary" : "ghost"}
              size="sm"
              text={translate("stay.notAllocated")}
              onPress={() => update(i, { unitId: null })}
            />
          </View>
          <View style={$row}>
            <Switch
              value={!m.adult}
              onValueChange={(v) => update(i, { adult: !v })}
              label={translate("stay.child")}
              labelPosition="left"
            />
            <Button
              preset="ghost"
              size="sm"
              text={translate("action.remove")}
              onPress={() => setMembers((ms) => ms.filter((_, j) => j !== i))}
            />
          </View>
        </View>
      ))}
      <Button
        preset="secondary"
        text={translate("stay.addMember")}
        onPress={() =>
          setMembers((ms) => [
            ...ms,
            { id: null, name: "", adult: true, idType: null, idLast4: null, unitId: null },
          ])
        }
      />
      <Text text={translate("checkin.members")} size="xs" style={{ color: theme.colors.textDim }} />
    </Sheet>
  )
}

/** Pick a free unit for the remaining nights: add a room, or change the one a unit is in. */
export function UnitSheet({
  open,
  onClose,
  booking,
  changing,
  onDone,
}: {
  open: boolean
  onClose: () => void
  booking: Booking
  changing: BookingUnit | null
  onDone: (unit: FreeUnit) => void
}) {
  const [free, setFree] = useState<FreeUnit[] | null>(null)
  useEffect(() => {
    if (!open) return
    const from = changing
      ? changing.arriveAt > new Date().toISOString()
        ? changing.arriveAt
        : new Date().toISOString()
      : new Date().toISOString()
    const to = changing?.departAt ?? booking.departAt
    setFree(null)
    void api.bookings.availability(from, to).then((r) => setFree(r.ok ? r.data : []))
  }, [open, booking.departAt, changing])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={changing ? translate("stay.changeRoom") : translate("stay.addUnit")}
      description={
        changing ? unitName(changing.roomNumber, changing.bedLabel) : translate("stay.pickUnit")
      }
    >
      {!free && <Loading rows={2} />}
      {free && free.length === 0 && <Text text={translate("stay.noneFree")} />}
      {free && free.length > 0 && <UnitPicker units={free} selected={[]} onToggle={onDone} />}
    </Sheet>
  )
}

const $member: ViewStyle = { gap: 8, paddingBottom: 8 }
const $unitRow: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
}
