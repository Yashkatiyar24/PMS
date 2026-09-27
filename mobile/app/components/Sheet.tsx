import { type ReactNode } from "react"
import { Modal, Pressable, ScrollView, View, type ViewStyle, type TextStyle } from "react-native"
import { KeyboardAvoidingView, Platform } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"

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

/** The bottom sheet every secondary form lives in (the web's `Sheet`). */
export function Sheet({ open, onClose, title, description, children, footer, locked }: SheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const close = () => {
    if (!locked) onClose()
  }
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={$fill}>
        <Pressable
          style={[$backdrop, { backgroundColor: theme.colors.palette.overlay50 }]}
          onPress={close}
          accessibilityLabel="Close"
        />
        <View
          style={[
            $sheet,
            { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={[$handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={$header}>
            <View style={$fill}>
              <Text text={title} preset="subheading" style={{ color: theme.colors.text }} />
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
                <Text text="✕" style={[$closeText, { color: theme.colors.textDim }]} />
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
          {footer && <View style={$footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $backdrop: ViewStyle = { flex: 1 }
const $sheet: ViewStyle = {
  maxHeight: "92%",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
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
const $close: ViewStyle = { width: 36, height: 36, alignItems: "center", justifyContent: "center" }
const $closeText: TextStyle = { fontSize: 18 }
const $body: ViewStyle = { flexGrow: 0 }
const $bodyContent: ViewStyle = { paddingBottom: 8, gap: 12 }
const $footer: ViewStyle = { paddingTop: 8, gap: 8 }
