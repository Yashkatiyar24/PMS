import { View, type TextStyle, type ViewStyle } from "react-native"

import { Ring, Text } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"

/**
 * Tonight, in one card.
 *
 * The question the desk asks first is how full the place is, so it gets the whole top of the screen in the
 * app's own maroon: the count, the total, and a ring for the share. Everything else on this screen is a
 * smaller number underneath it.
 */
export function HomeHero({ today }: { today: Today }) {
  const { theme } = useAppTheme()
  const sellable = Math.max(0, today.totalUnits - today.blockedUnits)
  const pct = sellable === 0 ? 0 : Math.round((today.bookedUnits * 100) / sellable)
  const onBrand = theme.colors.onSolid
  return (
    <View style={[$card, { backgroundColor: theme.colors.palette.brand }]}>
      <View style={$left}>
        <Text
          text={translate("dash.occupancy")}
          size="sm"
          style={{ color: onBrand, opacity: 0.85 }}
        />
        <View style={$count}>
          <Text text={String(today.bookedUnits)} style={[$big, { color: onBrand }]} />
          <Text text={`/ ${sellable}`} style={[$of, { color: onBrand, opacity: 0.7 }]} />
        </View>
        <Text
          text={translate("mobile.staysInHouse", { n: today.inHouse.length })}
          size="sm"
          style={{ color: onBrand, opacity: 0.85 }}
        />
      </View>
      <Ring pct={pct} size={116} color={onBrand} track={`${onBrand}2e`} textColor={onBrand} />
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
