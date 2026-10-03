import { ScrollView, type ViewStyle } from "react-native"

import { StatTile } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"

export type ActivityView =
  | "arrivals"
  | "departures"
  | "inHouse"
  | "stayovers"
  | "booked"
  | "cancelled"
  | "overbookings"
  | "noShow"

/** The seven tiles the web shows: each filters the list below. */
export function ActivityTiles({
  today,
  view,
  onChange,
}: {
  today: Today
  view: ActivityView
  onChange: (v: ActivityView) => void
}) {
  const stayovers = today.inHouse.filter((b) => !today.departures.some((d) => d.id === b.id)).length
  const tiles: {
    view: ActivityView
    label: string
    value: number
    tone?: "danger" | "warn" | "brand"
  }[] = [
    {
      view: "arrivals",
      label: translate("today.arrivals"),
      value: today.arrivals.length + today.arrived.length,
    },
    { view: "departures", label: translate("today.departures"), value: today.departures.length },
    { view: "inHouse", label: translate("today.inHouse"), value: today.inHouse.length },
    { view: "stayovers", label: translate("dash.stayovers"), value: stayovers },
    { view: "booked", label: translate("dash.bookingsMade"), value: today.booked.length },
    { view: "cancelled", label: translate("dash.cancellations"), value: today.cancelled.length },
    {
      view: "overbookings",
      label: translate("dash.overbookings"),
      value: today.channelConflicts,
      tone: today.channelConflicts > 0 ? "danger" : undefined,
    },
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$row}>
      {tiles.map((t) => (
        <StatTile
          key={t.view}
          label={t.label}
          value={t.value}
          tone={t.tone ?? "brand"}
          active={view === t.view}
          onPress={() => onChange(t.view)}
        />
      ))}
    </ScrollView>
  )
}

/** Which stays a tile shows. */
export function staysFor(today: Today, view: ActivityView, showDone: boolean) {
  switch (view) {
    case "arrivals":
      return showDone ? [...today.arrivals, ...today.arrived] : today.arrivals
    case "departures":
      return today.departures
    case "inHouse":
      return today.inHouse
    case "stayovers":
      return today.inHouse.filter((b) => !today.departures.some((d) => d.id === b.id))
    case "booked":
      return today.booked
    case "cancelled":
      return today.cancelled
    case "noShow":
      return today.flaggedNoShow
    default:
      return []
  }
}

const $row: ViewStyle = { gap: 8, paddingVertical: 4 }
