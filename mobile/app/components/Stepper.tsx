import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Glyph } from "./Glyph"
import { Text } from "./Text"

export type StepperProps = {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

/** A caption over the figure, with − and + in soft teal discs: adults, children, nights, quantities. */
export function Stepper({ label, value, min = 0, max = 999, onChange }: StepperProps) {
  const { theme } = useAppTheme()
  const button = (icon: "minus" | "plus", next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      style={({ pressed }) => [
        $button,
        {
          backgroundColor: theme.colors.palette.brandSoft,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Glyph name={icon} size={16} color={theme.colors.palette.brandInk} weight={2.2} />
    </Pressable>
  )
  return (
    <View style={$row}>
      <View style={$text}>
        <Text text={label} style={[$label, { color: theme.colors.textDim }]} />
        <Text text={String(value)} style={[$value, { color: theme.colors.text }]} />
      </View>
      {button("minus", value - 1, value <= min, "Decrease")}
      {button("plus", value + 1, value >= max, "Increase")}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 }
const $text: ViewStyle = { flex: 1 }
const $label: TextStyle = { fontSize: 12, lineHeight: 16, fontWeight: "500" }
const $value: TextStyle = {
  fontSize: 18,
  lineHeight: 24,
  fontWeight: "600",
  fontVariant: ["tabular-nums"],
}
const $button: ViewStyle = {
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: "center",
  justifyContent: "center",
}
