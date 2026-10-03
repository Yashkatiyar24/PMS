import { ChoiceChips, Disclosure, Input, Switch } from "@/components"
import { translate, translateOr } from "@/i18n/translate"

import type { NewBookingForm } from "../../hooks/useNewBookingForm"
import { DESK_SOURCES } from "../../types"

/** "More details": source, group/company fields, city, requests, tentative hold, WhatsApp. */
export function BookingDetailsCard({
  form,
  patch,
}: {
  form: NewBookingForm
  patch: (p: Partial<NewBookingForm>) => void
}) {
  const isGroup = form.source === "group"
  const corporate = form.source === "corporate" || form.source === "travel_agent" || isGroup
  const summary = [
    translateOr(`source.${form.source}`, form.source),
    form.city,
    form.tentative ? translate("state.pending") : "",
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Disclosure title={translate("booking.details")} summary={summary}>
      <ChoiceChips
        value={form.source}
        onChange={(source) =>
          patch({ source, units: source === "group" ? form.units : form.units.slice(0, 1) })
        }
        options={DESK_SOURCES.map((s) => ({ value: s, label: translateOr(`source.${s}`, s) }))}
      />
      {!!isGroup && (
        <Input
          label={translate("booking.groupName")}
          value={form.groupName}
          onChangeText={(groupName) => patch({ groupName })}
        />
      )}
      {!!corporate && (
        <Input
          label={translate("booking.organization")}
          value={form.organization}
          onChangeText={(organization) => patch({ organization })}
        />
      )}
      {form.source === "corporate" && (
        <Input
          label={translate("booking.billingGstin")}
          value={form.gstin}
          onChangeText={(t) => patch({ gstin: t.toUpperCase().slice(0, 15) })}
          autoCapitalize="characters"
        />
      )}
      <Input
        label={translate("checkin.city")}
        value={form.city}
        onChangeText={(city) => patch({ city })}
      />
      <Input
        label={translate("booking.specialRequests")}
        value={form.requests}
        onChangeText={(requests) => patch({ requests })}
        multiline
      />
      <Switch
        value={form.tentative}
        onValueChange={(tentative) => patch({ tentative })}
        label={translate("booking.tentative")}
        helper={translate("booking.tentativeHint")}
        labelPosition="right"
      />
      <Switch
        value={form.whatsappOptIn}
        onValueChange={(whatsappOptIn) => patch({ whatsappOptIn })}
        label={translate("checkin.whatsappOptIn")}
        labelPosition="right"
      />
    </Disclosure>
  )
}
