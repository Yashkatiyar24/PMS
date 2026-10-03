import { ComponentType, useState } from "react"
import {
  Animated,
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"

import { usePressScale } from "@/hooks/usePressScale"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle, ThemedStyleArray } from "@/theme/types"

import { Glyph, type GlyphName } from "./Glyph"
import { Gradient } from "./Gradient"
import { Text, TextProps } from "./Text"

/**
 * primary = the teal gradient call-to-action, its label set in small capitals as the reference does
 * ("COMPLETE ✓", "SIGN IN →"); secondary = outlined; soft = a teal tint; danger; ghost = text only.
 */
type Presets = "primary" | "secondary" | "soft" | "danger" | "ghost"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonAccessoryProps {
  style: StyleProp<ViewStyle>
  pressableState: PressableStateCallbackType
  disabled?: boolean
}

export interface ButtonProps extends PressableProps {
  tx?: TextProps["tx"]
  text?: TextProps["text"]
  txOptions?: TextProps["txOptions"]
  style?: StyleProp<ViewStyle>
  pressedStyle?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  pressedTextStyle?: StyleProp<TextStyle>
  disabledTextStyle?: StyleProp<TextStyle>
  preset?: Presets
  /** Height: sm 36, md 46 (default), lg 54. */
  size?: ButtonSize
  /** An icon after the label, as the reference puts a tick or an arrow at the end of its main button. */
  icon?: GlyphName
  /** An icon before the label. */
  leadingIcon?: GlyphName
  RightAccessory?: ComponentType<ButtonAccessoryProps>
  LeftAccessory?: ComponentType<ButtonAccessoryProps>
  children?: React.ReactNode
  disabled?: boolean
  disabledStyle?: StyleProp<ViewStyle>
}

const RADIUS = 14
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** A button. The main one carries the brand gradient; the rest are quiet. */
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
    icon,
    leadingIcon,
    RightAccessory,
    LeftAccessory,
    disabled,
    disabledStyle: $disabledViewStyleOverride,
    ...rest
  } = props

  const { themed, theme } = useAppTheme()
  // The whole button dips under the thumb and springs back; the press colour below is only the second cue.
  const press = usePressScale(0.97)
  const [pressed, setPressed] = useState(false)

  const preset: Presets = props.preset ?? "primary"
  const size: ButtonSize = props.size ?? "md"
  const solid = preset === "primary" || preset === "danger"
  const iconColor = {
    primary: theme.colors.onSolid,
    danger: theme.colors.onSolid,
    secondary: theme.colors.text,
    soft: theme.colors.palette.brandInk,
    ghost: theme.colors.palette.brandInk,
  }[preset]
  const iconSize = size === "sm" ? 15 : 18

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
  function $textStyle({ pressed }: PressableStateCallbackType): StyleProp<TextStyle> {
    return [
      themed($textPresets[preset]),
      size === "sm" && { fontSize: 12.5, letterSpacing: solid ? 0.8 : 0 },
      $textStyleOverride,
      !!pressed && themed([$pressedTextPresets[preset], $pressedTextStyleOverride]),
      !!disabled && $disabledTextStyleOverride,
    ]
  }
  // Small capitals are the reference's voice for its main actions; the style does it, so the label keeps its
  // written case for screen readers and tests.
  const label = text

  return (
    <AnimatedPressable
      style={[$viewStyle({ pressed }), press.style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      onPressIn={(e) => {
        setPressed(true)
        press.onPressIn()
        rest.onPressIn?.(e)
      }}
      onPressOut={(e) => {
        setPressed(false)
        press.onPressOut()
        rest.onPressOut?.(e)
      }}
      disabled={disabled}
    >
      {(state) => (
        <>
          {preset === "primary" && (
            <Gradient radius={RADIUS} style={state.pressed ? { opacity: 0.88 } : undefined} />
          )}
          {!!LeftAccessory && (
            <LeftAccessory
              style={themed($leftAccessoryStyle)}
              pressableState={state}
              disabled={disabled}
            />
          )}
          {!!leadingIcon && (
            <View style={$glyphBox}>
              <Glyph name={leadingIcon} size={iconSize} color={iconColor} weight={2} />
            </View>
          )}
          {(!!tx || !!text || !!children) && (
            <Text tx={tx} text={label} txOptions={txOptions} style={$textStyle(state)}>
              {children}
            </Text>
          )}
          {!!icon && (
            <View style={$glyphBox}>
              <Glyph name={icon} size={iconSize} color={iconColor} weight={2} />
            </View>
          )}
          {!!RightAccessory && (
            <RightAccessory
              style={themed($rightAccessoryStyle)}
              pressableState={state}
              disabled={disabled}
            />
          )}
        </>
      )}
    </AnimatedPressable>
  )
}

const $baseViewStyle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 46,
  borderRadius: RADIUS,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  overflow: "hidden",
  gap: spacing.xs,
})

const $sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11 },
  md: { minHeight: 46 },
  lg: { minHeight: 54, paddingHorizontal: 20 },
}

const $baseTextStyle: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontSize: 15,
  lineHeight: 20,
  fontFamily: typography.primary.medium,
  fontWeight: "600",
  textAlign: "center",
  flexShrink: 1,
  flexGrow: 0,
  zIndex: 2,
})

/** The gradient button's label: a little smaller, spaced out, in capitals. */
const $solidTextStyle: TextStyle = {
  fontSize: 14,
  letterSpacing: 1.3,
  fontWeight: "700",
  textTransform: "uppercase",
}

const $glyphBox: ViewStyle = { zIndex: 2 }
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
    ({ colors }) => ({
      backgroundColor: colors.palette.brand,
      shadowColor: colors.palette.brand,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    }),
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
  primary: [$baseTextStyle, $solidTextStyle, ({ colors }) => ({ color: colors.onSolid })],
  secondary: [$baseTextStyle, ({ colors }) => ({ color: colors.text })],
  soft: [$baseTextStyle, ({ colors }) => ({ color: colors.palette.brandInk })],
  danger: [$baseTextStyle, $solidTextStyle, ({ colors }) => ({ color: colors.onSolid })],
  ghost: [$baseTextStyle, ({ colors }) => ({ color: colors.palette.brandInk })],
}

const $pressedViewPresets: Record<Presets, ThemedStyle<ViewStyle>> = {
  primary: () => ({ opacity: 0.92 }),
  secondary: ({ colors }) => ({ backgroundColor: colors.surface2 }),
  soft: ({ colors }) => ({ backgroundColor: colors.palette.brandSoft, opacity: 0.85 }),
  danger: () => ({ opacity: 0.9 }),
  ghost: ({ colors }) => ({ backgroundColor: colors.surface2 }),
}

const $pressedTextPresets: Record<Presets, ThemedStyle<TextStyle>> = {
  primary: () => ({ opacity: 0.95 }),
  secondary: () => ({ opacity: 0.9 }),
  soft: () => ({ opacity: 0.9 }),
  danger: () => ({ opacity: 0.95 }),
  ghost: () => ({ opacity: 0.9 }),
}
