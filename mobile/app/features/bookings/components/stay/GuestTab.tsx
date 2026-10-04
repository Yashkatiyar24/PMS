import { View, type ViewStyle } from "react-native"

import { Button, KV, Loading, Panel } from "@/components"
import type { Guest } from "@/features/guests/types"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatPhone } from "@/utils/format"

import type { Booking } from "../../types"

/** The guest's register details, with a link to the full profile. */
export function GuestTab({ booking }: { booking: Booking }) {
  const navigation = useAppNavigation()
  const guest = useResource<Guest>(() => api.guests.get(booking.guestId), [booking.guestId], {
    cacheKey: `guest.${booking.guestId}`,
  })
  const g = guest.data
  if (!g) return <Loading rows={2} />
  return (
    <View style={$wrap}>
      <Panel>
        <KV label={translate("checkin.name")} value={g.name} strong />
        <KV label={translate("checkin.phoneLookup")} value={formatPhone(g.phone) || "—"} />
        <KV label={translate("checkin.city")} value={g.city || "—"} />
        <KV label={translate("checkin.address")} value={g.address || "—"} />
        <KV label={translate("checkin.nationality")} value={g.nationality || "—"} />
        <KV
          label={translate("checkin.idType")}
          value={g.idType ? translateOr(`id.${g.idType}`, g.idType) : "—"}
        />
        <KV label={translate("checkin.idLast4")} value={g.idLast4 ? `•••• ${g.idLast4}` : "—"} />
        {!!booking.organization && (
          <KV
            label={translate("stay.company")}
            value={`${booking.organization}${booking.billingGstin ? ` · ${booking.billingGstin}` : ""}`}
          />
        )}
      </Panel>
      <Button
        preset="secondary"
        text={translate("stay.guestProfile")}
        onPress={() => navigation.navigate("Guest", { id: g.id })}
      />
    </View>
  )
}

const $wrap: ViewStyle = { gap: 12 }
