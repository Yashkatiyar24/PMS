import { Pressable, View, type ViewStyle } from "react-native"

import { Chip, Text } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { isEqualValue } from "../lib/settingsDraft"
import type { SettingDef } from "../types"
import { SettingControl } from "./SettingControl"

export type SettingRowProps = {
  def: SettingDef
  value: unknown
  inDraft: boolean
  editable: boolean
  onChange: (value: unknown) => void
  onReset: () => void
}

/** Label, description, Edited/Changed chips, lock line, the control and a reset link. */
export function SettingRow({ def, value, inDraft, editable, onChange, onReset }: SettingRowProps) {
  const { theme } = useAppTheme()
  const label = translateOr(`setting.${def.key}`, def.key.replace(/_/g, " "))
  const changed = !isEqualValue(value, def.defaultValue)
  return (
    <View style={[$row, { borderBottomColor: theme.colors.border }]}>
      <View style={$head}>
        <Text text={label} weight="bold" size="sm" style={{ color: theme.colors.text, flex: 1 }} />
        {inDraft && <Chip tone="warn" text={translate("settings.edited")} />}
        {!inDraft && changed && <Chip tone="brand" text={translate("settings.changed")} />}
      </View>
      {!!def.description && (
        <Text text={def.description} size="xs" style={{ color: theme.colors.textDim }} />
      )}
      {!editable && (
        <Text
          text={translate("settings.lockedTo", {
            role: translate(`settings.role.${def.who}` as "settings.role.OWNER"),
          })}
          size="xxs"
          style={{ color: theme.colors.textFaint }}
        />
      )}
      <SettingControl def={def} value={value} disabled={!editable} onChange={onChange} />
      {editable && changed && (
        <Pressable onPress={onReset} accessibilityRole="button">
          <Text
            text={`${translate("settings.resetToDefault")} · ${String(defaultLabel(def))}`}
            size="xs"
            style={{ color: theme.colors.palette.brandInk }}
          />
        </Pressable>
      )}
    </View>
  )
}

function defaultLabel(def: SettingDef): string {
  const d = def.defaultValue
  if (d === null || d === undefined || d === "") return translate("common.none")
  if (typeof d === "boolean") return d ? translate("common.yes") : translate("common.no")
  if (typeof d === "number") return def.key.endsWith("_paise") ? `₹${d / 100}` : String(d)
  if (Array.isArray(d)) return d.join(", ")
  if (typeof d === "object") return "…"
  return translateOr(`option.${String(d)}`, String(d))
}

const $row: ViewStyle = { gap: 6, paddingVertical: 12, borderBottomWidth: 1 }
const $head: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
