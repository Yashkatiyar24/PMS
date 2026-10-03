import { useState } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { addDays, addMonths, formatDate, formatMonth, fromApiDate, today } from "@/utils/date"

import { Glyph } from "./Glyph"
import { Sheet } from "./Sheet"
import { Text } from "./Text"

export type DateFieldProps = {
  label: string
  /** `yyyy-mm-dd` */
  value: string
  onChange: (day: string) => void
  min?: string
  max?: string
  hint?: string
  error?: string
}

/**
 * A date picker built from views: an underline field like `Input`, with a calendar icon at the end; tapping it
 * opens a month grid in a sheet. The grid is the reference's inventory calendar — weekend columns in red, the
 * chosen day a solid teal disc, today ringed.
 */
export function DateField({ label, value, onChange, min, max, hint, error }: DateFieldProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const borderColor = error ? theme.colors.palette.danger : theme.colors.borderStrong
  return (
    <View style={$field}>
      <Text text={label} style={[$label, { color: theme.colors.textDim }]} />
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}`}
        style={({ pressed }) => [
          $box,
          { borderBottomColor: borderColor, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text text={formatDate(value) || "—"} style={[$value, { color: theme.colors.text }]} />
        <Glyph name="calendar" size={20} color={theme.colors.palette.brandInk} />
      </Pressable>
      {!!error && <Text text={error} size="xs" style={{ color: theme.colors.palette.danger }} />}
      {!error && !!hint && <Text text={hint} size="xs" style={{ color: theme.colors.textDim }} />}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <MonthGrid
          value={value || today()}
          min={min}
          max={max}
          onPick={(d) => {
            onChange(d)
            setOpen(false)
          }}
        />
      </Sheet>
    </View>
  )
}

function MonthGrid({
  value,
  min,
  max,
  onPick,
}: {
  value: string
  min?: string
  max?: string
  onPick: (d: string) => void
}) {
  const { theme } = useAppTheme()
  const [month, setMonth] = useState(value.slice(0, 7) + "-01")
  const first = fromApiDate(month) ?? new Date()
  const lead = (first.getDay() + 6) % 7 // Monday first
  const days: string[] = []
  for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) days.push(d)
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max)
  return (
    <View style={$grid}>
      <View style={$monthRow}>
        <Pressable
          onPress={() => setMonth(addMonths(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={[$nav, { backgroundColor: theme.colors.surface2 }]}
        >
          <Glyph name="back" size={18} color={theme.colors.text} />
        </Pressable>
        <Text text={formatMonth(month)} style={[$monthTitle, { color: theme.colors.text }]} />
        <Pressable
          onPress={() => setMonth(addMonths(month, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={[$nav, { backgroundColor: theme.colors.surface2 }]}
        >
          <Glyph name="forward" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
      <View style={$week}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w, i) => (
          <Text
            key={w}
            text={w}
            size="xxs"
            style={[
              $cellText,
              $weekday,
              { color: i >= 5 ? theme.colors.palette.danger : theme.colors.textDim },
            ]}
          />
        ))}
      </View>
      <View style={$cells}>
        {cells.map((d, i) => {
          const selected = d === value
          const ok = !!d && allowed(d)
          const isToday = d === today()
          const weekend = i % 7 >= 5
          return (
            <Pressable
              key={i}
              disabled={!ok}
              onPress={() => d && onPick(d)}
              accessibilityRole="button"
              accessibilityLabel={d ? formatDate(d) : undefined}
              style={[
                $cell,
                selected && { backgroundColor: theme.colors.palette.brand },
                isToday &&
                  !selected && { borderWidth: 1.5, borderColor: theme.colors.palette.brand },
              ]}
            >
              <Text
                text={d ? String(Number(d.slice(8))) : ""}
                style={[
                  $cellText,
                  {
                    color: selected
                      ? theme.colors.onSolid
                      : !ok
                        ? theme.colors.textFaint
                        : weekend
                          ? theme.colors.palette.danger
                          : theme.colors.text,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const $field: ViewStyle = { gap: 2 }
const $label: TextStyle = { fontSize: 12, lineHeight: 16, fontWeight: "500" }
const $box: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 44,
  borderBottomWidth: 1,
  paddingBottom: 6,
}
const $value: TextStyle = { fontSize: 17, lineHeight: 22, fontWeight: "500" }
const $grid: ViewStyle = { gap: 8, paddingBottom: 8 }
const $monthRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 8,
}
const $monthTitle: TextStyle = { fontSize: 16, fontWeight: "700" }
const $nav: ViewStyle = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: "center",
  justifyContent: "center",
}
const $week: ViewStyle = { flexDirection: "row", marginTop: 4 }
const $weekday: TextStyle = { fontWeight: "700", letterSpacing: 0.6 }
const $cells: ViewStyle = { flexDirection: "row", flexWrap: "wrap" }
const $cell: ViewStyle = {
  width: `${100 / 7}%`,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 22,
}
const $cellText: TextStyle = {
  width: `${100 / 7}%`,
  textAlign: "center",
  fontSize: 15,
  fontWeight: "500",
}
