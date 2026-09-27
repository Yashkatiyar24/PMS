import { View, type ViewStyle } from "react-native"

import { KV, Panel, Ring, Text } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

/** Tonight's occupancy ring with available / booked / out-of-service and the free units per type. */
export function OccupancyCard({ today }: { today: Today }) {
  const { theme } = useAppTheme()
  const sellable = Math.max(0, today.totalUnits - today.blockedUnits)
  const pct = sellable > 0 ? (today.bookedUnits / sellable) * 100 : 0
  return (
    <Panel>
      <View style={$row}>
        <Ring pct={pct} label={translate("dash.occupancy")} />
        <View style={$facts}>
          <KV
            label={translate("dash.available")}
            value={String(Math.max(0, sellable - today.bookedUnits))}
            tone="ok"
          />
          <KV label={translate("dash.booked")} value={String(today.bookedUnits)} />
          <KV
            label={translate("dash.outOfService")}
            value={String(today.blockedUnits)}
            tone={today.blockedUnits > 0 ? "danger" : undefined}
          />
        </View>
      </View>
      {today.freeByType.length > 0 && (
        <View style={$types}>
          {today.freeByType.map((t) => (
            <Text
              key={t.type_name}
              size="xs"
              style={{ color: theme.colors.textDim }}
              text={`${t.type_name} · ${translate("dash.free", { n: t.free })}`}
            />
          ))}
        </View>
      )}
    </Panel>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 16 }
const $facts: ViewStyle = { flex: 1 }
const $types: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 12 }
