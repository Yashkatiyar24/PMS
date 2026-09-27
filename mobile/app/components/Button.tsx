import { ComponentType } from "react"
import {
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"

import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle, ThemedStyleArray } from "@/theme/types"

import { Text, TextProps } from "./Text"

/** primary = solid ink pill (the web's default), secondary = outlined, soft = brand tint, danger, ghost. */
type Presets = "primary" | "secondary" | "soft" | "danger" | "ghost"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonAccessoryProps {
  style: StyleProp<any>
  pressableState: PressableStateCallbackType
  disabled?: boolean
}

export interface ButtonProps extends PressableProps {
  /**
   * Text which is looked up via i18n.
   */
  tx?: TextProps["tx"]
  /**
   * The text to display if not using `tx` or nested components.
   */
  text?: TextProps["text"]
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  txOptions?: TextProps["txOptions"]
  /**
   * An optional style override useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>
  /**
   * An optional style override for the "pressed" state.
   */
  pressedStyle?: StyleProp<ViewStyle>
  /**
   * An optional style override for the button text.
   */
  textStyle?: StyleProp<TextStyle>
  /**
   * An optional style override for the button text when in the "pressed" state.
   */
  pressedTextStyle?: StyleProp<TextStyle>
  /**
   * An optional style override for the button text when in the "disabled" state.
   */
  disabledTextStyle?: StyleProp<TextStyle>
  /**
   * One of the different types of button presets.
   */
  preset?: Presets
  /**
   * Height: sm 36, md 44 (default), lg 52.
   */
  size?: ButtonSize
  /**
   * An optional component to render on the right side of the text.
   * Example: `RightAccessory={(props) => <View {...props} />}`
   */
  RightAccessory?: ComponentType<ButtonAccessoryProps>
  /**
   * An optional component to render on the left side of the text.
   * Example: `LeftAccessory={(props) => <View {...props} />}`
   */
  LeftAccessory?: ComponentType<ButtonAccessoryProps>
  /**
   * Children components.
   */
  children?: React.ReactNode
  /**
   * disabled prop, accessed directly for declarative styling reasons.
   * https://reactnative.dev/docs/pressable#disabled
   */
  disabled?: boolean
  /**
   * An optional style override for the disabled state
   */
  disabledStyle?: StyleProp<ViewStyle>
}

/**
 * A component that allows users to take actions and make choices.
 * Wraps the Text component with a Pressable component.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Button/}
 * @param {ButtonProps} props - The props for the `Button` component.
 * @returns {JSX.Element} The rendered `Button` component.
 * @example
 * <Button
 *   tx="common:ok"
 *   style={styles.button}
 *   textStyle={styles.buttonText}
 *   onPress={handleButtonPress}
 * />
 */
export function Button(props: ButtonProps) {
  const {
    tx,
    text,
    txOptions,
    style: $viewStyleOverride,
    pressedStyle: $pressedViewStyleOverride,
    textStyle: $textStyleOverride,
    pressedTextStyle: $pressedTextStyleOverride,
    disabledTextStyle: $disabledTextStyleOverride,
    children,
    RightAccessory,
    LeftAccessory,
    disabled,
    disabledStyle: $disabledViewStyleOverride,
    ...rest
  } = props

  const { themed } = useAppTheme()

  const preset: Presets = props.preset ?? "primary"
  const size: ButtonSize = props.size ?? "md"
  /**
   * @param {PressableStateCallbackType} root0 - The root object containing the pressed state.
   * @param {boolean} root0.pressed - The pressed state.
   * @returns {StyleProp<ViewStyle>} The view style based on the pressed state.
   */
  function $viewStyle({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> {
    return [
      themed($viewPresets[preset]),
      $sizeStyles[size],
      $viewStyleOverride,
      !!pressed && themed([$pressedViewPresets[preset], $pressedViewStyleOverride]),
      !!disabled && { opacity: 0.45 },
      !!disabled && $disabledViewStyleOverride,
    ]
  }
  /**
   * @param {PressableStateCallbackType} root0 - The root object containing the pressed state.
   * @param {boolean} root0.pressed - The pressed state.
   * @returns {StyleProp<TextStyle>} The text style based on the pressed state.
   */
  function $textStyle({ pressed }: PressableStateCallbackType): StyleProp<TextStyle> {
    return [
      themed($textPresets[preset]),
      size === "sm" && { fontSize: 14 },
      $textStyleOverride,
      !!pressed && themed([$pressedTextPresets[preset], $pressedTextStyleOverride]),
      !!disabled && $disabledTextStyleOverride,
    ]
  }

  return (
    <Pressable
      style={$viewStyle}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      disabled={disabled}
    >
      {(state) => (
        <>
          {!!LeftAccessory && (
            <LeftAccessory style={$leftAccessoryStyle} pressableState={state} disabled={disabled} />
          )}

          <Text tx={tx} text={text} txOptions={txOptions} style={$textStyle(state)}>
            {children}
          </Text>

          {!!RightAccessory && (
            <RightAccessory
              style={$rightAccessoryStyle}
              pressableState={state}
              disabled={disabled}
            />
          )}
        </>
      )}
    </Pressable>
  )
}

const $baseViewStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  borderRadius: 999,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  overflow: "hidden",
  gap: spacing.xs,
})

const $sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 12 },
  md: { minHeight: 44 },
  lg: { minHeight: 52, paddingHorizontal: 20 },
}

const $baseTextStyle: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontSize: 16,
  lineHeight: 20,
  fontFamily: typography.primary.medium,
  fontWeight: "600",
  textAlign: "center",
  flexShrink: 1,
  flexGrow: 0,
  zIndex: 2,
})

const $rightAccessoryStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginStart: spacing.xxs,
  zIndex: 1,
})
const $leftAccessoryStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginEnd: spacing.xxs,
  zIndex: 1,
})

const $viewPresets: Record<Presets, ThemedStyleArray<ViewStyle>> = {
  primary: [
    $styles.row,
    $baseViewStyle,
    ({ colors }) => ({ backgroundColor: colors.primaryButton }),
  ],
  secondary: [
    $styles.row,
    $baseViewStyle,
    ({ colors }) => ({
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    }),
  ],
  soft: [
    $styles.row,
    $baseViewStyle,
    ({ colors }) => ({ backgroundColor: colors.palette.brandSoft }),
  ],
  danger: [
    $styles.row,
    $baseViewStyle,
    ({ colors }) => ({ backgroundColor: colors.palette.danger }),
  ],
  ghost: [$styles.row, $baseViewStyle, () => ({ backgroundColor: "transparent" })],
}

const $textPresets: Record<Presets, ThemedStyleArray<TextStyle>> = {
  primary: [$baseTextStyle, ({ colors }) => ({ color: colors.onSolid })],
  secondary: [$baseTextStyle, ({ colors }) => ({ color: colors.text })],
  soft: [$baseTextStyle, ({ colors }) => ({ color: colors.palette.brandInk })],
  danger: [$baseTextStyle, ({ colors }) => ({ color: colors.palette.onSolid })],
  ghost: [$baseTextStyle, ({ colors }) => ({ color: colors.palette.brandInk })],
}

const $pressedViewPresets: Record<Presets, ThemedStyle<ViewStyle>> = {
  primary: () => ({ opacity: 0.85, transform: [{ scale: 0.985 }] }),
  secondary: ({ colors }) => ({ backgroundColor: colors.surface2 }),
  soft: () => ({ opacity: 0.85 }),
  danger: () => ({ opacity: 0.85 }),
  ghost: ({ colors }) => ({ backgroundColor: colors.surface2 }),
}

const $pressedTextPresets: Record<Presets, ThemedStyle<TextStyle>> = {
  primary: () => ({ opacity: 0.9 }),
  secondary: () => ({ opacity: 0.9 }),
  soft: () => ({ opacity: 0.9 }),
  danger: () => ({ opacity: 0.9 }),
  ghost: () => ({ opacity: 0.9 }),
}
