import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type ChoiceOption<T extends string> = { value: T; label: string; disabled?: boolean }

type SingleProps<T extends string> = {
  value: T | null
  onChange: (value: T) => void
  multi?: false
}
type MultiProps<T extends string> = { value: T[]; onChange: (value: T[]) => void; multi: true }

export type ChoiceChipsProps<T extends string> = (SingleProps<T> | MultiProps<T>) & {
  options: ChoiceOption<T>[]
  disabled?: boolean
}

/** Tappable pills, exclusive or multi-select; the mobile form of the web's ChoiceChips. */
export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  const { theme } = useAppTheme()
  const selected = (v: T) => (props.multi ? props.value.includes(v) : props.value === v)
  const toggle = (v: T) => {
    if (props.multi)
      props.onChange(selected(v) ? props.value.filter((x) => x !== v) : [...props.value, v])
    else props.onChange(v)
  }
  return (
    <View style={$wrap} accessibilityRole="radiogroup">
      {props.options.map((o) => {
        const on = selected(o.value)
        const off = props.disabled || o.disabled
        return (
          <Pressable
            key={o.value}
            disabled={off}
            onPress={() => toggle(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: !!off }}
            style={[
              $chip,
              {
                backgroundColor: on ? theme.colors.primaryButton : theme.colors.surface,
                borderColor: on ? theme.colors.primaryButton : theme.colors.borderStrong,
                opacity: off ? 0.45 : 1,
              },
            ]}
          >
            <Text
              text={o.label}
              style={[$label, { color: on ? theme.colors.onSolid : theme.colors.text }]}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const $wrap: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $chip: ViewStyle = {
  minHeight: 40,
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: 14,
  justifyContent: "center",
}
const $label: TextStyle = { fontSize: 14, fontWeight: "600" }
