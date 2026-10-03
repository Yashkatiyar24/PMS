import { type ReactNode, useEffect, useRef } from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useAppTheme } from "@/theme/context"

import { Glyph } from "./Glyph"
import { Text } from "./Text"

export type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Buttons pinned under the scrolling body. */
  footer?: ReactNode
  /** When true the sheet cannot be dismissed (forced password change). */
  locked?: boolean
}

const NATIVE = Platform.OS !== "web"

/** How long a sheet takes to fade away. */
const DISMISS_MS = 260

/**
 * Run `next` once a sheet that is closing has slid away. Use it when closing a sheet leads to another screen or
 * sheet: iOS will not present one while a modal is still dismissing, and in a browser a screen hidden
 * mid-animation leaves the invisible modal on top, swallowing every tap.
 */
export function afterSheetCloses(next: () => void): void {
  setTimeout(next, DISMISS_MS)
}

/** The bottom sheet every secondary form lives in (the web's `Sheet`). */
export function Sheet({ open, onClose, title, description, children, footer, locked }: SheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  // The dim fades in with the modal; the sheet itself rises from below and settles, so the two read as one
  // motion: the room darkens, the form arrives. Reduced motion skips the rise.
  const rise = useRef(new Animated.Value(reduced ? 0 : 1)).current
  useEffect(() => {
    if (!open) return
    rise.setValue(reduced ? 0 : 1)
    if (reduced) return
    Animated.spring(rise, { toValue: 0, speed: 14, bounciness: 2, useNativeDriver: NATIVE }).start()
  }, [open, reduced, rise])
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, 48] })
  const close = () => {
    if (!locked) onClose()
  }
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={$fill}>
        <Pressable
          style={[$backdrop, { backgroundColor: theme.colors.palette.overlay50 }]}
          onPress={close}
          accessibilityLabel="Close"
        />
        <Animated.View
          style={[
            $sheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[$handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={$header}>
            <View style={$fill}>
              <Text
                text={title}
                preset="subheading"
                style={[$title, { color: theme.colors.text }]}
              />
              {!!description && (
                <Text text={description} size="xs" style={{ color: theme.colors.textDim }} />
              )}
            </View>
            {!locked && (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                style={$close}
              >
                <Glyph name="close" size={18} color={theme.colors.textDim} />
              </Pressable>
            )}
          </View>
          <ScrollView
            style={$body}
            contentContainerStyle={$bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {!!footer && <View style={$footer}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $title: TextStyle = { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }
const $backdrop: ViewStyle = { flex: 1 }
const $sheet: ViewStyle = {
  maxHeight: "92%",
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  paddingHorizontal: 16,
  paddingTop: 8,
}
const $handle: ViewStyle = {
  alignSelf: "center",
  width: 36,
  height: 4,
  borderRadius: 2,
  marginBottom: 8,
}
const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 8,
}
const $close: ViewStyle = { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
const $body: ViewStyle = { flexGrow: 0 }
const $bodyContent: ViewStyle = { paddingBottom: 8, gap: 12 }
const $footer: ViewStyle = { paddingTop: 8, gap: 8 }
