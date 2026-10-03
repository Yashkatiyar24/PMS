import { useState } from "react"

import { Button, ChoiceChips, Input, Sheet } from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { api, type ApiResult } from "@/services/api"
import { digitsOnly, rupees } from "@/utils/format"

import type { NewPropertyResult } from "../types"

/** Add a property: organisation, property, city, owner and plan → sign-in details for the owner. */
export function OnboardSheet({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (result: ApiResult<NewPropertyResult>) => void
}) {
  const plans = useResource(() => api.admin.plans(), [], { cacheKey: "admin.plans" })
  const [f, setF] = useState({
    orgName: "",
    propertyName: "",
    city: "",
    state: "",
    phone: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    planCode: "basic",
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const ready =
    f.orgName.trim() &&
    f.propertyName.trim() &&
    f.ownerName.trim() &&
    digitsOnly(f.ownerPhone).length >= 10
  const submit = async () =>
    onDone(
      await api.admin.onboard({
        ...f,
        phone: digitsOnly(f.phone),
        ownerPhone: digitsOnly(f.ownerPhone),
        ownerEmail: f.ownerEmail.trim(),
      }),
    )
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("admin.onboard")}
      footer={
        <Button size="lg" text={translate("admin.onboard")} onPress={submit} disabled={!ready} />
      }
    >
      <Input
        label={translate("admin.trust")}
        value={f.orgName}
        onChangeText={set("orgName")}
        autoFocus
      />
      <Input
        label={translate("setup.name")}
        value={f.propertyName}
        onChangeText={set("propertyName")}
      />
      <Input label={translate("setup.city")} value={f.city} onChangeText={set("city")} />
      <Input label={translate("setup.state")} value={f.state} onChangeText={set("state")} />
      <Input
        label={translate("setup.phone")}
        value={f.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
      />
      <Input
        label={translate("admin.ownerName")}
        value={f.ownerName}
        onChangeText={set("ownerName")}
      />
      <Input
        label={translate("admin.ownerPhone")}
        value={f.ownerPhone}
        onChangeText={set("ownerPhone")}
        keyboardType="phone-pad"
      />
      <Input
        label={translate("admin.ownerEmail")}
        hint={translate("admin.ownerEmailHint")}
        value={f.ownerEmail}
        onChangeText={set("ownerEmail")}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <ChoiceChips
        value={f.planCode}
        onChange={set("planCode")}
        options={(plans.data ?? []).map((p) => ({
          value: p.code,
          label: `${p.name} · ${translate("admin.planHint", { rooms: p.maxRooms, price: rupees(p.monthlyPaise) })}`,
        }))}
      />
    </Sheet>
  )
}
