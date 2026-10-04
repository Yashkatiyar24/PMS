import { useState, type ReactNode } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Glyph } from "./Glyph"
import { Text } from "./Text"

export type DisclosureProps = {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}

/** A collapsible card section. */
export function Disclosure({ title, summary, defaultOpen = false, children }: DisclosureProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View
      style={[$card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={$head}
      >
        <View style={$titles}>
          <Text text={title} style={[$title, { color: theme.colors.text }]} />
          {!!summary && !open && (
            <Text
              text={summary}
              size="xs"
              style={{ color: theme.colors.textDim }}
              numberOfLines={1}
            />
          )}
        </View>
        <Glyph name={open ? "chevronUp" : "chevronDown"} size={18} color={theme.colors.textDim} />
      </Pressable>
      {!!open && <View style={$body}>{children}</View>}
    </View>
  )
}

const $card: ViewStyle = { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 }
const $head: ViewStyle = { flexDirection: "row", alignItems: "center", minHeight: 52, gap: 8 }
const $titles: ViewStyle = { flex: 1 }
const $title: TextStyle = { fontSize: 15, fontWeight: "700" }
const $body: ViewStyle = { paddingBottom: 14, gap: 10 }
