/* eslint-disable no-restricted-imports -- this is the one TextInput wrapper */
import { forwardRef, useState, type ReactNode } from "react"
import { TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type InputProps = Omit<TextInputProps, "style"> & {
  label?: string
  hint?: string
  /** A validation message; the underline turns red. */
  error?: string
  /** Something at the right edge: a unit, a button. */
  right?: ReactNode
  /** Something at the left edge, e.g. "₹". */
  left?: ReactNode
  disabled?: boolean
  monospace?: boolean
  style?: ViewStyle
}

/**
 * A text field the way the reference draws one: a small grey caption, the value in a larger weight, and a
 * hairline under it that turns teal while it has the focus. No box, so a form reads as a page, not a grid.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    hint,
    error,
    right,
    left,
    disabled,
    monospace,
    style,
    multiline,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const { theme } = useAppTheme()
  const [focused, setFocused] = useState(false)
  const lineColor = error
    ? theme.colors.palette.danger
    : focused
      ? theme.colors.palette.brand
      : theme.colors.borderStrong
  return (
    <View style={[$field, style]}>
      {!!label && (
        <Text
          text={label}
          style={[
            $label,
            { color: focused ? theme.colors.palette.brandInk : theme.colors.textDim },
          ]}
        />
      )}
      <View
        style={[
          $box,
          { borderBottomColor: lineColor, borderBottomWidth: focused || error ? 2 : 1 },
          disabled && { opacity: 0.55 },
          multiline && $multi,
        ]}
      >
        {left}
        <TextInput
          ref={ref}
          editable={!disabled}
          multiline={multiline}
          // A secret is typed exactly as it is: many Android keyboards otherwise capitalise its first letter,
          // which the dots hide, and the server then says the password is wrong.
          {...(rest.secureTextEntry
            ? { autoCapitalize: "none" as const, autoCorrect: false, spellCheck: false }
            : null)}
          placeholderTextColor={theme.colors.textFaint}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[
            $input,
            {
              color: theme.colors.text,
              fontFamily: monospace ? theme.typography.code?.normal : undefined,
            },
            multiline && $multiInput,
          ]}
          {...rest}
        />
        {right}
      </View>
      {!!error && <Text text={error} size="xxs" style={{ color: theme.colors.palette.danger }} />}
      {!error && !!hint && (
        <Text text={hint} size="xxs" style={{ color: theme.colors.textFaint }} />
      )}
    </View>
  )
})

const $field: ViewStyle = { gap: 2 }
const $label: TextStyle = { fontSize: 12, lineHeight: 16, fontWeight: "500" }
const $box: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  minHeight: 46,
  gap: 8,
}
const $multi: ViewStyle = { alignItems: "flex-start" }
const $input: TextStyle = {
  flex: 1,
  fontSize: 17,
  fontWeight: "500",
  paddingVertical: 10,
  paddingHorizontal: 0,
  minHeight: 44,
}
const $multiInput: TextStyle = { minHeight: 80, textAlignVertical: "top" }
