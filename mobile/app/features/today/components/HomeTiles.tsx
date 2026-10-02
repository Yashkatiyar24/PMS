import { View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"
import { typography } from "@/theme/typography"

/** One number worth knowing before the desk opens, with the one line that explains it. */
function Tile({
  glyph,
  tone,
  value,
  label,
  hint,
}: {
  glyph: string
  tone: Tone
  value: string
  label: string
  hint: string
}) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  return (
    <View
      style={[$tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <View style={[$glyph, { backgroundColor: soft }]}>
        <Text text={glyph} style={{ fontSize: 15, lineHeight: 19, color: solid }} />
      </View>
      <Text
        text={value}
        style={[$value, { color: theme.colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      />
      <Text text={label} size="xs" style={{ color: theme.colors.text }} numberOfLines={1} />
      <Text text={hint} size="xxs" style={{ color: theme.colors.textDim }} numberOfLines={1} />
    </View>
  )
}

/** The three the desk glances at: who is leaving, what is free, who is coming. */
export function HomeTiles({ today }: { today: Today }) {
  const free = Math.max(0, today.totalUnits - today.blockedUnits - today.bookedUnits)
  return (
    <View style={$row}>
      <Tile
        glyph="→"
        tone="warn"
        value={String(today.departures.length)}
        label={translate("mobile.dueOut")}
        hint={
          today.departures.length === 0
            ? translate("mobile.nobodyToday")
            : translate("today.departures")
        }
      />
      <Tile
        glyph="⌸"
        tone="ok"
        value={String(free)}
        label={translate("mobile.freeRooms")}
        hint={
          today.blockedUnits > 0
            ? `${translate("dash.outOfService")} ${today.blockedUnits}`
            : translate("mobile.allClean")
        }
      />
      <Tile
        glyph="←"
        tone="brand"
        value={String(today.arrivals.length)}
        label={translate("mobile.arrivingToday")}
        hint={translate("mobile.alreadyIn", { n: today.arrived.length })}
      />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 10 }
const $tile: ViewStyle = { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12, gap: 3 }
const $glyph: ViewStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 4,
}
const $value: TextStyle = { fontFamily: typography.display.bold, fontSize: 26, lineHeight: 32 }
