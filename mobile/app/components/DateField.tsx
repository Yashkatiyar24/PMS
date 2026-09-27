import { useState } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { addDays, addMonths, formatDate, formatMonth, fromApiDate, today } from "@/utils/date"

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

/** A date picker built from views: tap to open a month grid in a sheet. */
export function DateField({ label, value, onChange, min, max, hint, error }: DateFieldProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const borderColor = error ? theme.colors.palette.danger : theme.colors.borderStrong
  return (
    <View style={$field}>
      <Text text={label} style={[$label, { color: theme.colors.text }]} />
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDate(value)}`}
        style={[$box, { borderColor, backgroundColor: theme.colors.surface }]}
      >
        <Text text={formatDate(value) || "—"} style={{ color: theme.colors.text, fontSize: 16 }} />
        <Text text="📅" />
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
          hitSlop={8}
          accessibilityLabel="Previous month"
        >
          <Text text="‹" style={[$nav, { color: theme.colors.text }]} />
        </Pressable>
        <Text text={formatMonth(month)} style={[$monthTitle, { color: theme.colors.text }]} />
        <Pressable
          onPress={() => setMonth(addMonths(month, 1))}
          hitSlop={8}
          accessibilityLabel="Next month"
        >
          <Text text="›" style={[$nav, { color: theme.colors.text }]} />
        </Pressable>
      </View>
      <View style={$week}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
          <Text
            key={w}
            text={w}
            size="xxs"
            style={[$cellText, { color: theme.colors.textFaint }]}
          />
        ))}
      </View>
      <View style={$cells}>
        {cells.map((d, i) => {
          const selected = d === value
          const ok = !!d && allowed(d)
          const isToday = d === today()
          return (
            <Pressable
              key={i}
              disabled={!ok}
              onPress={() => d && onPick(d)}
              accessibilityRole="button"
              accessibilityLabel={d ? formatDate(d) : undefined}
              style={[
                $cell,
                selected && { backgroundColor: theme.colors.primaryButton },
                isToday && !selected && { borderWidth: 1, borderColor: theme.colors.tint },
              ]}
            >
              <Text
                text={d ? String(Number(d.slice(8))) : ""}
                style={[
                  $cellText,
                  {
                    color: selected
                      ? theme.colors.onSolid
                      : ok
                        ? theme.colors.text
                        : theme.colors.textFaint,
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

const $field: ViewStyle = { gap: 4 }
const $label: TextStyle = { fontSize: 13, fontWeight: "600" }
const $box: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 44,
  borderWidth: 1,
  borderRadius: 10,
  paddingHorizontal: 12,
}
const $grid: ViewStyle = { gap: 8, paddingBottom: 8 }
const $monthRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 8,
}
const $monthTitle: TextStyle = { fontSize: 16, fontWeight: "700" }
const $nav: TextStyle = { fontSize: 28, lineHeight: 32, paddingHorizontal: 12 }
const $week: ViewStyle = { flexDirection: "row" }
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
