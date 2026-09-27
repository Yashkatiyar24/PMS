import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"

import { Text } from "./Text"

export type BannerTone = Extract<Tone, "info" | "ok" | "warn" | "danger">

export type BannerProps = {
  tone?: BannerTone
  text: string
  /** A second line under the message. */
  detail?: string
  /** An inline action such as "Open channels". */
  actionText?: string
  onAction?: () => void
  onClose?: () => void
  style?: ViewStyle
}

/** A full-width message strip: offline, saved, error, billing state. */
export function Banner({
  tone = "info",
  text,
  detail,
  actionText,
  onAction,
  onClose,
  style,
}: BannerProps) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "text"}
      style={[$banner, { backgroundColor: soft, borderColor: solid }, style]}
    >
      <View style={$body}>
        <Text text={text} style={[$text, { color: theme.colors.text }]} />
        {!!detail && <Text text={detail} size="xs" style={{ color: theme.colors.textDim }} />}
        {!!actionText && (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
            <Text text={actionText} style={[$action, { color: solid }]} />
          </Pressable>
        )}
      </View>
      {!!onClose && (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
        >
          <Text text="✕" style={{ color: theme.colors.textDim }} />
        </Pressable>
      )}
    </View>
  )
}

const $banner: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
  borderRadius: 12,
  borderLeftWidth: 3,
  paddingVertical: 10,
  paddingHorizontal: 12,
  gap: 8,
}
const $body: ViewStyle = { flex: 1, gap: 2 }
const $text: TextStyle = { fontSize: 14, lineHeight: 20, fontWeight: "600" }
const $action: TextStyle = { fontSize: 14, fontWeight: "700", marginTop: 4 }
