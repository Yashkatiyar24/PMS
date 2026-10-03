import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components"
import { Glyph } from "@/components/Glyph"
import { Gradient } from "@/components/Gradient"
import { useAppTheme } from "@/theme/context"

/**
 * The bar the desk's thumb lives on.
 *
 * A white pill floating clear of the bottom edge rather than a full-width strip, with the one action the desk
 * reaches for forty times a day — starting a check-in — as a round button in the middle of it, where a thumb
 * naturally lands. The tabs either side carry the role's own screens, so this is the same navigation the app
 * always had, wearing a different coat.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const routes = state.routes
  const middle = Math.ceil(routes.length / 2)

  const tab = (route: (typeof routes)[number], index: number) => {
    const { options } = descriptors[route.key]
    const focused = state.index === index
    const label = typeof options.title === "string" ? options.title : route.name
    const color = focused ? theme.colors.palette.brandInk : theme.colors.textDim
    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
        }}
        style={({ pressed }) => [$tab, pressed && { opacity: 0.6 }]}
      >
        <View style={[$glyphBox, focused && { backgroundColor: theme.colors.palette.brandSoft }]}>
          {options.tabBarIcon?.({ focused, color, size: 22 })}
        </View>
        <Text text={label} numberOfLines={1} style={[$label, { color }]} />
      </Pressable>
    )
  }

  return (
    <View style={[$wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        style={[
          $bar,
          { backgroundColor: theme.colors.surface, shadowColor: theme.colors.palette.shadow },
        ]}
      >
        {routes.slice(0, middle).map((r, i) => tab(r, i))}
        <View style={$gap} />
        {routes.slice(middle).map((r, i) => tab(r, i + middle))}
      </View>
      {/* The one action worth a thumb of its own. Centred over the bar, overlapping it, as the desk expects. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+"
        onPress={() => navigation.navigate("CheckIn" as never)}
        style={({ pressed }) => [
          $fab,
          { shadowColor: theme.colors.palette.brandStrong, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Gradient radius={29} angle={45} />
        <Glyph name="plus" size={28} color={theme.colors.onSolid} weight={2.4} />
      </Pressable>
    </View>
  )
}

const $wrap: ViewStyle = { paddingHorizontal: 12, paddingTop: 6, backgroundColor: "transparent" }
const $bar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 28,
  paddingVertical: 8,
  paddingHorizontal: 4,
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
}
const $tab: ViewStyle = { flex: 1, alignItems: "center", gap: 1, paddingVertical: 2 }
const $glyphBox: ViewStyle = {
  minWidth: 46,
  alignItems: "center",
  borderRadius: 14,
  paddingVertical: 3,
}
const $label: TextStyle = { fontSize: 11, fontWeight: "600" }
const $gap: ViewStyle = { width: 62 }
const $fab: ViewStyle = {
  position: "absolute",
  alignSelf: "center",
  top: -14,
  width: 58,
  height: 58,
  borderRadius: 29,
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  shadowOpacity: 0.35,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 10,
}
