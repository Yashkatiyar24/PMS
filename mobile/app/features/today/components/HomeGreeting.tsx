import { useState } from "react"
import { Animated, Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Avatar, Text } from "@/components"
import { UserMenuSheet } from "@/features/auth/components/UserMenuSheet"
import { usePressScale } from "@/hooks/usePressScale"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"
import { formatDate } from "@/utils/date"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * The date, the person, and nothing else: the top of the desk's own screen. The avatar is the same door to the
 * person's menu (language, appearance, log out) that every other screen's header has.
 */
export function HomeGreeting({ name, date }: { name: string; date?: string }) {
  const { theme } = useAppTheme()
  const [menu, setMenu] = useState(false)
  const press = usePressScale(0.92)
  const hour = new Date().getHours()
  const greeting =
    hour < 12
      ? "mobile.greetingMorning"
      : hour < 17
        ? "mobile.greetingAfternoon"
        : "mobile.greetingEvening"
  // Just the first name: "Good morning, Ramesh Agarwal" is a letterhead, not a greeting.
  const first = name.trim().split(/\s+/)[0] || name
  return (
    <View style={$row}>
      <View style={$left}>
        {!!date && (
          <Text text={formatDate(date)} size="sm" style={{ color: theme.colors.textDim }} />
        )}
        <Text
          text={translate(greeting, { name: first })}
          style={[$title, { color: theme.colors.text }]}
          numberOfLines={2}
        />
      </View>
      <AnimatedPressable
        onPress={() => setMenu(true)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={name}
        testID="user-menu"
        style={press.style}
      >
        <Avatar name={name} size={46} />
      </AnimatedPressable>
      <UserMenuSheet open={menu} onClose={() => setMenu(false)} />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12 }
const $left: ViewStyle = { flex: 1, gap: 2 }
const $title: TextStyle = { fontFamily: typography.display.bold, fontSize: 28, lineHeight: 34 }
