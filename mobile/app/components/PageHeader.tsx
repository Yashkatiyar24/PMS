import { type ReactNode } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type PageHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  /** Buttons at the right edge. */
  actions?: ReactNode
}

/** Screen title row: back arrow, title, subtitle, actions. */
export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <View style={$row}>
      {onBack && (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={$back}
        >
          <Text text="‹" style={[$backGlyph, { color: theme.colors.text }]} />
        </Pressable>
      )}
      <View style={$titles}>
        <Text text={title} style={[$title, { color: theme.colors.text }]} numberOfLines={2} />
        {!!subtitle && (
          <Text
            text={subtitle}
            size="xs"
            style={{ color: theme.colors.textDim }}
            numberOfLines={2}
          />
        )}
      </View>
      {actions && <View style={$actions}>{actions}</View>}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }
const $back: ViewStyle = { width: 36, height: 36, alignItems: "center", justifyContent: "center" }
const $backGlyph: TextStyle = { fontSize: 30, lineHeight: 34, fontWeight: "600" }
const $titles: ViewStyle = { flex: 1 }
const $title: TextStyle = { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 }
const $actions: ViewStyle = { flexDirection: "row", gap: 8, alignItems: "center" }
