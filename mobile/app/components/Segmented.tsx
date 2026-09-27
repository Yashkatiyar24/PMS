import { Pressable, ScrollView, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type SegmentedItem<T extends string> = { value: T; label: string; count?: number }

export type SegmentedProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  items: SegmentedItem<T>[]
  /** Scroll horizontally instead of squeezing when there are many items. */
  scroll?: boolean
}

/** A pill track of exclusive options, with optional counts. */
export function Segmented<T extends string>({ value, onChange, items, scroll }: SegmentedProps<T>) {
  const { theme } = useAppTheme()
  const track = (
    <View style={[$track, { backgroundColor: theme.colors.surface2 }]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = item.value === value
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              $item,
              active && { backgroundColor: theme.colors.surface },
              !scroll && { flex: 1 },
            ]}
          >
            <Text
              text={item.label}
              style={[$label, { color: active ? theme.colors.text : theme.colors.textDim }]}
              numberOfLines={1}
            />
            {item.count !== undefined && (
              <Text text={String(item.count)} style={[$count, { color: theme.colors.textFaint }]} />
            )}
          </Pressable>
        )
      })}
    </View>
  )
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {track}
    </ScrollView>
  ) : (
    track
  )
}

const $track: ViewStyle = { flexDirection: "row", borderRadius: 999, padding: 3, gap: 2 }
const $item: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  minHeight: 36,
  paddingHorizontal: 12,
  borderRadius: 999,
}
const $label: TextStyle = { fontSize: 13, fontWeight: "600" }
const $count: TextStyle = { fontSize: 12, fontVariant: ["tabular-nums"] }
