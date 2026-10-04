import { translate } from "@/i18n/translate"

import { Input } from "./Input"

export type PinFieldProps = { value: string; onChangeText: (pin: string) => void; error?: string }

/** The approval PIN, shown only when the signed-in role lacks the permission an action needs. */
export function PinField({ value, onChangeText, error }: PinFieldProps) {
  return (
    <Input
      label={translate("mobile.pin")}
      hint={translate("mobile.pinHint")}
      value={value}
      onChangeText={(t) => onChangeText(t.replace(/\D/g, "").slice(0, 6))}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={6}
      error={error}
      autoComplete="off"
    />
  )
}
