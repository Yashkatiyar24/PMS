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

/** A row of exclusive options on a pale track; the chosen one lifts to white with its words in teal. */
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
              active && {
                backgroundColor: theme.colors.surface,
                shadowColor: theme.colors.palette.shadow,
                shadowOpacity: 0.08,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 1,
              },
              !scroll && { flex: 1 },
            ]}
          >
            <Text
              text={item.label}
              style={[
                $label,
                { color: active ? theme.colors.palette.brandInk : theme.colors.textDim },
              ]}
              numberOfLines={1}
            />
            {item.count !== undefined && (
              <Text
                text={String(item.count)}
                style={[
                  $count,
                  { color: active ? theme.colors.palette.brand : theme.colors.textFaint },
                ]}
              />
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

const $track: ViewStyle = { flexDirection: "row", borderRadius: 14, padding: 3, gap: 2 }
const $item: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minHeight: 38,
  paddingHorizontal: 14,
  borderRadius: 11,
}
const $label: TextStyle = { fontSize: 13, fontWeight: "600" }
const $count: TextStyle = { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }
