import { View, type TextStyle, type ViewStyle } from "react-native"

import { Ring, Text } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"

/**
 * Tonight, in one card.
 *
 * The question the desk asks first is how full the place is, so it gets the top of the screen: the count,
 * the total, and a ring for the share — on a plain white card, so the page stays light and the number does
 * the talking. Everything else on this screen is a smaller number underneath it.
 */
export function HomeHero({ today }: { today: Today }) {
  const { theme } = useAppTheme()
  const sellable = Math.max(0, today.totalUnits - today.blockedUnits)
  const pct = sellable === 0 ? 0 : Math.round((today.bookedUnits * 100) / sellable)
  return (
    <View
      style={[
        $card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
      ]}
    >
      <View style={$left}>
        <Text
          text={translate("dash.occupancy")}
          size="sm"
          style={{ color: theme.colors.textDim }}
        />
        <View style={$count}>
          <Text text={String(today.bookedUnits)} style={[$big, { color: theme.colors.text }]} />
          <Text text={`/ ${sellable}`} style={[$of, { color: theme.colors.textFaint }]} />
        </View>
        <Text
          text={translate("mobile.staysInHouse", { n: today.inHouse.length })}
          size="sm"
          style={{ color: theme.colors.textDim }}
        />
      </View>
      <Ring pct={pct} size={116} />
    </View>
  )
}

const $card: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: 24,
  padding: 20,
  gap: 12,
}
const $left: ViewStyle = { flex: 1, gap: 2 }
const $count: ViewStyle = { flexDirection: "row", alignItems: "baseline", gap: 6 }
const $big: TextStyle = { fontFamily: typography.display.bold, fontSize: 44, lineHeight: 52 }
const $of: TextStyle = { fontFamily: typography.display.normal, fontSize: 24, lineHeight: 30 }
