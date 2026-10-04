import { useEffect, useState } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import { toneColors } from "@/theme/tones"

import { Text } from "./Text"
import { dismissToast, subscribeToasts, type Toast } from "./toast"

/** Renders toasts above everything; mounted once in app.tsx. */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  useEffect(() => subscribeToasts(setToasts), [])
  if (toasts.length === 0) return null
  return (
    <View pointerEvents="box-none" style={[$host, { top: insets.top + 8 }]}>
      {toasts.map((t) => {
        const { solid, soft } = toneColors(theme.colors, t.tone)
        return (
          <Pressable
            key={t.id}
            onPress={() => dismissToast(t.id)}
            accessibilityRole="alert"
            style={[$toast, { backgroundColor: soft, borderColor: solid }]}
          >
            <Text text={t.text} style={[$text, { color: theme.colors.text }]} />
          </Pressable>
        )
      })}
    </View>
  )
}

const $host: ViewStyle = { position: "absolute", left: 16, right: 16, gap: 8, zIndex: 1000 }
const $toast: ViewStyle = {
  borderRadius: 12,
  borderLeftWidth: 3,
  paddingVertical: 10,
  paddingHorizontal: 14,
  elevation: 4,
}
const $text: TextStyle = { fontSize: 14, fontWeight: "600" }
