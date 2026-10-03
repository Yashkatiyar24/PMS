import { type ReactNode } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"

import { Glyph } from "./Glyph"
import { Text } from "./Text"

export type PageHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  /** Buttons at the right edge. */
  actions?: ReactNode
}

/**
 * The top of a pushed screen, as the reference sets it: a thin back chevron on its own line, then the title
 * large and dark with the air of a magazine heading, and whatever acts on the screen out at the right.
 */
export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <View style={$wrap}>
      {(!!onBack || !!actions) && (
        <View style={$toolbar}>
          {!!onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={$back}
            >
              <Glyph name="arrowLeft" size={22} color={theme.colors.textDim} />
            </Pressable>
          ) : (
            <View />
          )}
          {!!actions && <View style={$actions}>{actions}</View>}
        </View>
      )}
      <Text text={title} style={[$title, { color: theme.colors.text }]} numberOfLines={2} />
      {!!subtitle && (
        <Text text={subtitle} size="xs" style={{ color: theme.colors.textDim }} numberOfLines={2} />
      )}
    </View>
  )
}

const $wrap: ViewStyle = { gap: 2, paddingTop: 4, paddingBottom: 6 }
const $toolbar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 40,
  marginLeft: -8,
}
const $back: ViewStyle = { width: 40, height: 40, alignItems: "center", justifyContent: "center" }
const $actions: ViewStyle = { flexDirection: "row", gap: 8, alignItems: "center" }
const $title: TextStyle = {
  fontFamily: typography.display.bold,
  fontSize: 30,
  lineHeight: 36,
  fontWeight: "700",
  letterSpacing: -0.6,
}
