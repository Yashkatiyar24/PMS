import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type StepperProps = {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

/** − value + for adults, children, nights, quantities. */
export function Stepper({ label, value, min = 0, max = 999, onChange }: StepperProps) {
  const { theme } = useAppTheme()
  const button = (text: string, next: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      style={[
        $button,
        {
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text text={text} style={[$sign, { color: theme.colors.text }]} />
    </Pressable>
  )
  return (
    <View style={$row}>
      <Text text={label} size="sm" style={{ color: theme.colors.textDim, flex: 1 }} />
      {button("−", value - 1, value <= min, "Decrease")}
      <Text text={String(value)} style={[$value, { color: theme.colors.text }]} />
      {button("+", value + 1, value >= max, "Increase")}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }
const $button: ViewStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
}
const $sign: TextStyle = { fontSize: 20, lineHeight: 24, fontWeight: "600" }
const $value: TextStyle = {
  minWidth: 28,
  textAlign: "center",
  fontSize: 18,
  fontWeight: "700",
  fontVariant: ["tabular-nums"],
}
