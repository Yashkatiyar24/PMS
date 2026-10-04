import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { ChoiceChips, Input, Switch, Text } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { intToText, parseInt_, unitFor } from "../lib/settingsDraft"
import type { SettingDef } from "../types"

export type SettingControlProps = {
  def: SettingDef
  value: unknown
  disabled: boolean
  onChange: (value: unknown) => void
}

/** The right input for a setting's type, as the web builds them from the registry. */
export function SettingControl({ def, value, disabled, onChange }: SettingControlProps) {
  switch (def.type) {
    case "BOOL":
      return (
        <Switch
          value={!!value}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
          label={value ? translate("common.yes") : translate("common.no")}
          labelPosition="right"
        />
      )
    case "INT":
      return <IntControl def={def} value={value} disabled={disabled} onChange={onChange} />
    case "TIME":
      return (
        <Input
          value={String(value ?? "")}
          onChangeText={(t) => /^\d{2}:\d{2}$/.test(t) && onChange(t)}
          placeholder="HH:mm"
          disabled={disabled}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      )
    case "ENUM":
      return (
        <ChoiceChips
          value={String(value ?? "")}
          onChange={onChange}
          disabled={disabled}
          options={(def.options ?? []).map((o) => ({
            value: o,
            label: translateOr(`option.${o}`, o),
          }))}
        />
      )
    case "LIST":
      return <ListControl def={def} value={value} disabled={disabled} onChange={onChange} />
    case "I18N_TEXT": {
      const v = (value ?? {}) as Record<string, string>
      return (
        <View style={$col}>
          <Input
            label="हिंदी"
            value={v.hi ?? ""}
            onChangeText={(t) => onChange({ ...v, hi: t })}
            disabled={disabled}
            multiline
          />
          <Input
            label="English"
            value={v.en ?? ""}
            onChangeText={(t) => onChange({ ...v, en: t })}
            disabled={disabled}
            multiline
          />
        </View>
      )
    }
    default:
      return (
        <Input
          value={String(value ?? "")}
          onChangeText={onChange}
          disabled={disabled}
          maxLength={def.maxLength ?? undefined}
        />
      )
  }
}

function IntControl({ def, value, disabled, onChange }: SettingControlProps) {
  const { theme } = useAppTheme()
  const [text, setText] = useState(intToText(def, value))
  const parsed = parseInt_(def, text)
  const unit = unitFor(def.key)
  const invalid = text !== "" && parsed === null
  return (
    <Input
      value={text}
      onChangeText={(t) => {
        setText(t)
        const n = parseInt_(def, t)
        if (n !== null) onChange(n)
      }}
      keyboardType="decimal-pad"
      disabled={disabled}
      left={unit === "₹" ? <Text text="₹" style={{ color: theme.colors.textDim }} /> : undefined}
      right={
        unit && unit !== "₹" ? (
          <Text
            text={translate(unit as "settings.unit.minutes")}
            size="xs"
            style={{ color: theme.colors.textDim }}
          />
        ) : undefined
      }
      error={
        invalid ? translate("settings.range", { min: def.min ?? 0, max: def.max ?? "" }) : undefined
      }
    />
  )
}

/** Ordered multi-select: tap to add at the end, tap again to remove; numbers show the order. */
function ListControl({ def, value, disabled, onChange }: SettingControlProps) {
  const { theme } = useAppTheme()
  const list = Array.isArray(value) ? value.map(String) : []
  if (!def.options)
    return <Text text={list.join(", ")} size="sm" style={{ color: theme.colors.textDim }} />
  return (
    <ChoiceChips
      multi
      value={list}
      disabled={disabled}
      onChange={(next) => onChange(next)}
      options={def.options.map((o) => {
        const idx = list.indexOf(o)
        return {
          value: o,
          label: `${idx >= 0 ? `${idx + 1}. ` : ""}${translateOr(`option.${o}`, o)}`,
        }
      })}
    />
  )
}

const $col: ViewStyle = { gap: 8 }
