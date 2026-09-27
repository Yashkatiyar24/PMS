import { useAppTheme } from "@/theme/context"

import { Input, type InputProps } from "./Input"
import { Text } from "./Text"

export type MoneyInputProps = Omit<
  InputProps,
  "value" | "onChangeText" | "keyboardType" | "left"
> & {
  /** Rupees as typed; convert with `toPaise` when submitting. */
  value: string
  onChangeText: (text: string) => void
}

/** A rupee field: ₹ prefix, decimal keypad, digits and one dot only. */
export function MoneyInput({ value, onChangeText, ...rest }: MoneyInputProps) {
  const { theme } = useAppTheme()
  return (
    <Input
      {...rest}
      value={value}
      onChangeText={(t) => onChangeText(sanitise(t))}
      keyboardType="decimal-pad"
      left={<Text text="₹" style={{ color: theme.colors.textDim, fontSize: 16 }} />}
    />
  )
}

function sanitise(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, "")
  const [whole, ...rest] = cleaned.split(".")
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole
}
