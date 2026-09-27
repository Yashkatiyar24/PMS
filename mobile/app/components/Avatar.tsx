import { View, type ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"
import { initials } from "@/utils/format"

import { Text } from "./Text"

export type AvatarProps = {
  name?: string | null
  tone?: Tone
  size?: number
  /** A glyph instead of initials, e.g. "🛏". */
  glyph?: string
}

/** Initials (or a glyph) in a soft-toned circle. */
export function Avatar({ name, tone = "brand", size = 40, glyph }: AvatarProps) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  return (
    <View
      style={[
        $circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: soft },
      ]}
    >
      <Text
        text={glyph ?? initials(name) ?? ""}
        style={{ color: solid, fontSize: size * 0.4, fontWeight: "700", lineHeight: size * 0.5 }}
      />
    </View>
  )
}

const $circle: ViewStyle = { alignItems: "center", justifyContent: "center" }
