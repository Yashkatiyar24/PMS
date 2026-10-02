import { View, type TextStyle, type ViewStyle } from "react-native"

import { Avatar, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"
import { formatDate } from "@/utils/date"

/** The date, the person, and nothing else: the top of the desk's own screen. */
export function HomeGreeting({ name, date }: { name: string; date?: string }) {
  const { theme } = useAppTheme()
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
      <Avatar name={name} size={46} />
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12 }
const $left: ViewStyle = { flex: 1, gap: 2 }
const $title: TextStyle = { fontFamily: typography.display.bold, fontSize: 28, lineHeight: 34 }
