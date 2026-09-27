import { View, type ViewStyle } from "react-native"

import { StatTile } from "@/components"
import { translate } from "@/i18n/translate"
import { rupees } from "@/utils/format"

import type { PropertyHealth } from "../types"

/** Platform-wide totals across every property. */
export function PlatformTiles({ all }: { all: PropertyHealth[] }) {
  const sum = (f: (p: PropertyHealth) => number) => all.reduce((s, p) => s + f(p), 0)
  return (
    <View style={$tiles}>
      <StatTile
        label={translate("admin.properties")}
        value={all.length}
        hint={`${all.filter((p) => p.billingStatus === "active").length} · ${all.filter((p) => p.billingStatus === "trial").length}`}
        style={$tile}
      />
      <StatTile
        label={translate("admin.roomsCount")}
        value={sum((p) => p.rooms)}
        tone="teal"
        style={$tile}
      />
      <StatTile
        label={translate("today.inHouse")}
        value={sum((p) => p.stayingNow)}
        tone="ok"
        style={$tile}
      />
      <StatTile
        label={translate("admin.recentBookings")}
        value={sum((p) => p.bookingsLast30Days)}
        tone="violet"
        style={$tile}
      />
      <StatTile
        label={translate("reports.outstanding")}
        value={rupees(sum((p) => p.outstandingPaise))}
        tone="danger"
        hint={translate("admin.openBillsCount", { n: sum((p) => p.openFolios) })}
        style={$tile}
      />
      <StatTile
        label={translate("admin.outbox")}
        value={sum((p) => p.outboxPending)}
        tone="warn"
        style={$tile}
      />
    </View>
  )
}

const $tiles: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $tile: ViewStyle = { flexBasis: "47%", flexGrow: 1 }
