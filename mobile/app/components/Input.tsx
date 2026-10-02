/* eslint-disable no-restricted-imports -- this is the one TextInput wrapper */
import { forwardRef, type ReactNode } from "react"
import { TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type InputProps = Omit<TextInputProps, "style"> & {
  label?: string
  hint?: string
  /** A validation message; the field turns red. */
  error?: string
  /** Something at the right edge: a unit, a button. */
  right?: ReactNode
  /** Something at the left edge, e.g. "₹". */
  left?: ReactNode
  disabled?: boolean
  monospace?: boolean
  style?: ViewStyle
}

/** A labelled text field with hint and error, 44 px tall, as on the web. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, right, left, disabled, monospace, style, multiline, ...rest },
  ref,
) {
  const { theme } = useAppTheme()
  const borderColor = error ? theme.colors.palette.danger : theme.colors.borderStrong
  return (
    <View style={[$field, style]}>
      {!!label && <Text text={label} style={[$label, { color: theme.colors.text }]} />}
      <View
        style={[
          $box,
          { borderColor, backgroundColor: disabled ? theme.colors.surface2 : theme.colors.surface },
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
      {!!error && <Text text={error} size="xs" style={{ color: theme.colors.palette.danger }} />}
      {!error && !!hint && <Text text={hint} size="xs" style={{ color: theme.colors.textDim }} />}
    </View>
  )
})

const $field: ViewStyle = { gap: 4 }
const $label: TextStyle = { fontSize: 13, fontWeight: "600" }
const $box: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  minHeight: 44,
  borderWidth: 1,
  borderRadius: 10,
  paddingHorizontal: 12,
  gap: 8,
}
const $multi: ViewStyle = { alignItems: "flex-start", paddingVertical: 8 }
const $input: TextStyle = { flex: 1, fontSize: 16, paddingVertical: 8, minHeight: 42 }
const $multiInput: TextStyle = { minHeight: 80, textAlignVertical: "top" }
