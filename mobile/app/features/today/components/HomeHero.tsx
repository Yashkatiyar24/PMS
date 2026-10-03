import { View, type TextStyle, type ViewStyle } from "react-native"

import { Gradient, Ring, Text } from "@/components"
import type { Today } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"

/**
 * Tonight, in one card.
 *
 * The question the desk asks first is how full the place is, so it gets the top of the screen and the one
 * gradient card on it — the reference's "Need to clean now" hero — with the count large in white, the total
 * beside it, and a ring for the share. Everything else on this screen is a quieter white card beneath.
 */
export function HomeHero({ today }: { today: Today }) {
  const { theme } = useAppTheme()
  const sellable = Math.max(0, today.totalUnits - today.blockedUnits)
  const pct = sellable === 0 ? 0 : Math.round((today.bookedUnits * 100) / sellable)
  const white = theme.colors.palette.onSolid
  return (
    <View style={[$card, { shadowColor: theme.colors.palette.brandStrong }]}>
      <Gradient radius={24} angle={45} />
      <View style={$left}>
        <Text
          text={translate("dash.occupancy").toUpperCase()}
          style={[$eyebrow, { color: white }]}
        />
        <View style={$count}>
          <Text text={String(today.bookedUnits)} style={[$big, { color: white }]} />
          <Text text={`/ ${sellable}`} style={[$of, { color: theme.colors.palette.onSolidSoft }]} />
        </View>
        <Text
          text={translate("mobile.staysInHouse", { n: today.inHouse.length })}
          size="sm"
          style={{ color: theme.colors.palette.onSolidSoft }}
        />
      </View>
      <Ring
        pct={pct}
        size={108}
        color={white}
        track={theme.colors.palette.onSolidFaint}
        textColor={white}
      />
    </View>
  )
}

const $card: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: 24,
  padding: 22,
  gap: 12,
  overflow: "hidden",
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
}
const $left: ViewStyle = { flex: 1, gap: 2 }
const $eyebrow: TextStyle = { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 1.4 }
const $count: ViewStyle = { flexDirection: "row", alignItems: "baseline", gap: 6 }
const $big: TextStyle = { fontFamily: typography.display.bold, fontSize: 48, lineHeight: 56 }
const $of: TextStyle = { fontFamily: typography.display.normal, fontSize: 22, lineHeight: 28 }
