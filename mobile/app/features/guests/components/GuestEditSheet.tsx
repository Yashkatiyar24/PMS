import { useState } from "react"

import { Button, ChoiceChips, Input, Sheet } from "@/components"
import { ID_TYPES, type IdType } from "@/features/bookings/types"
import { translate, translateOr } from "@/i18n/translate"
import { digitsOnly } from "@/utils/format"

import type { Guest, GuestInput } from "../types"

/** Every field of the register entry. */
export function GuestEditSheet({
  guest,
  onClose,
  onSave,
}: {
  guest: Guest
  onClose: () => void
  onSave: (body: GuestInput) => void
}) {
  const [f, setF] = useState({
    name: guest.name,
    phone: guest.phone,
    email: guest.email ?? "",
    address: guest.address,
    city: guest.city,
    state: guest.state,
    country: guest.country,
    nationality: guest.nationality,
    idType: guest.idType,
    idLast4: guest.idLast4 ?? "",
    passportNo: guest.passportNo ?? "",
    visaNo: guest.visaNo ?? "",
    notes: guest.notes,
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const save = () =>
    onSave({
      name: f.name.trim(),
      phone: digitsOnly(f.phone).slice(-10),
      email: f.email.trim() || null,
      address: f.address,
      city: f.city,
      state: f.state,
      country: f.country,
      nationality: f.nationality.toUpperCase(),
      idType: f.idType,
      idLast4: f.idLast4 || null,
      passportNo: f.passportNo || null,
      visaNo: f.visaNo || null,
      visaExpiry: guest.visaExpiry,
      notes: f.notes,
    })
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("guests.edit")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={save}
          disabled={!f.name.trim()}
        />
      }
    >
      <Input label={translate("checkin.name")} value={f.name} onChangeText={set("name")} />
      <Input
        label={translate("checkin.phoneLookup")}
        value={f.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
      />
      <Input
        label={translate("setup.email")}
        value={f.email}
        onChangeText={set("email")}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input label={translate("checkin.address")} value={f.address} onChangeText={set("address")} />
      <Input label={translate("checkin.city")} value={f.city} onChangeText={set("city")} />
      <Input label={translate("setup.state")} value={f.state} onChangeText={set("state")} />
      <Input label={translate("guests.country")} value={f.country} onChangeText={set("country")} />
      <Input
        label={translate("checkin.nationality")}
        hint={translate("guests.nationalityHint")}
        value={f.nationality}
        onChangeText={(t) => set("nationality")(t.toUpperCase().slice(0, 2))}
        autoCapitalize="characters"
        maxLength={2}
      />
      <ChoiceChips<IdType>
        value={f.idType}
        onChange={(idType) => setF((s) => ({ ...s, idType }))}
        options={ID_TYPES.map((t) => ({ value: t, label: translateOr(`id.${t}`, t) }))}
      />
      <Input
        label={translate("checkin.idLast4")}
        value={f.idLast4}
        onChangeText={(t) => set("idLast4")(t.replace(/\W/g, "").slice(0, 4))}
        maxLength={4}
      />
      <Input
        label={translate("guests.passport")}
        value={f.passportNo}
        onChangeText={set("passportNo")}
        autoCapitalize="characters"
      />
      <Input
        label={translate("guests.visa")}
        value={f.visaNo}
        onChangeText={set("visaNo")}
        autoCapitalize="characters"
      />
      <Input
        label={translate("guests.notes")}
        value={f.notes}
        onChangeText={set("notes")}
        multiline
      />
    </Sheet>
  )
}
