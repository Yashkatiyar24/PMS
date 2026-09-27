import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { rupees, unitName } from "@/utils/format"

import type { FreeUnit } from "../types"

export type UnitKey = { roomId: string; bedId: string | null }

export type UnitPickerProps = {
  units: FreeUnit[]
  selected: UnitKey[]
  onToggle: (unit: FreeUnit) => void
  /** Only these room types (empty = all). */
  roomTypeIds?: string[]
  /** Amber dot for units still to be cleaned. */
  showStatus?: boolean
}

export const sameUnit = (a: UnitKey, b: UnitKey) =>
  a.roomId === b.roomId && (a.bedId ?? null) === (b.bedId ?? null)

/** Free rooms and beds grouped by type; tap to pick. Shared by check-in, new booking and the stay. */
export function UnitPicker({
  units,
  selected,
  onToggle,
  roomTypeIds,
  showStatus = true,
}: UnitPickerProps) {
  const { theme } = useAppTheme()
  const shown = roomTypeIds?.length
    ? units.filter((u) => roomTypeIds.includes(u.roomTypeId))
    : units
  const groups = new Map<string, FreeUnit[]>()
  for (const u of shown) groups.set(u.typeName, [...(groups.get(u.typeName) ?? []), u])
  if (shown.length === 0)
    return (
      <Text text={translate("today.noneFree")} size="sm" style={{ color: theme.colors.textDim }} />
    )
  return (
    <View style={$groups}>
      {[...groups.entries()].map(([type, list]) => (
        <View key={type} style={$group}>
          <Text
            text={`${type} · ${rupees(list[0].ratePaise)}`}
            size="xs"
            style={{ color: theme.colors.textDim }}
          />
          <View style={$wrap}>
            {list.map((u) => {
              const on = selected.some((s) => sameUnit(s, u))
              const dirty = u.status === "dirty" || u.status === "cleaning"
              return (
                <Pressable
                  key={`${u.roomId}-${u.bedId ?? "room"}`}
                  onPress={() => onToggle(u)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    $unit,
                    {
                      borderColor: on ? theme.colors.primaryButton : theme.colors.borderStrong,
                      backgroundColor: on ? theme.colors.primaryButton : theme.colors.surface,
                    },
                  ]}
                >
                  {showStatus && dirty && (
                    <View style={[$dot, { backgroundColor: theme.colors.palette.warn }]} />
                  )}
                  <Text
                    text={unitName(u.roomNumber, u.bedLabel)}
                    style={[$label, { color: on ? theme.colors.onSolid : theme.colors.text }]}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const $groups: ViewStyle = { gap: 12 }
const $group: ViewStyle = { gap: 6 }
const $wrap: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $unit: ViewStyle = {
  minHeight: 44,
  minWidth: 56,
  paddingHorizontal: 12,
  borderRadius: 10,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: 6,
}
const $dot: ViewStyle = { width: 6, height: 6, borderRadius: 3 }
const $label: TextStyle = { fontSize: 15, fontWeight: "700" }
