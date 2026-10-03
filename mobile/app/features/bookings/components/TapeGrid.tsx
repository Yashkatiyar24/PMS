import { useState } from "react"
import { Pressable, ScrollView, View, type ViewStyle } from "react-native"

import { Text } from "@/components"
import { useAppTheme } from "@/theme/context"
import { formatWeekday, today } from "@/utils/date"

import type { Bar, Group, Lane } from "../lib/tapeChart"

export const DAY_W = 56
export const LABEL_W = 84
const LANE_H = 44

export type TapeGridProps = {
  days: string[]
  groups: Group[]
  load: { busy: number; free: number; pct: number }[]
  onBar: (bar: Bar) => void
  onLongBar: (bar: Bar) => void
  onCell: (lane: Lane, day: string) => void
}

/** Sticky unit column + horizontally scrolling days; bars by state; tap a cell to book it. */
export function TapeGrid({ days, groups, load, onBar, onLongBar, onCell }: TapeGridProps) {
  const { theme } = useAppTheme()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const todayIdx = days.indexOf(today())
  const colour = (state: string) =>
    state === "checked_in"
      ? theme.colors.palette.ok
      : state === "reserved" || state === "pending"
        ? theme.colors.palette.brand
        : theme.colors.textFaint

  return (
    <View style={$row}>
      <View style={{ width: LABEL_W }}>
        <View style={[$head, { height: 48 }]} />
        {groups.map((g) => (
          <View key={g.type}>
            <Pressable
              onPress={() => setCollapsed((c) => ({ ...c, [g.type]: !c[g.type] }))}
              style={[$groupHead, { backgroundColor: theme.colors.surface2 }]}
            >
              <Text
                text={`${collapsed[g.type] ? "▸" : "▾"} ${g.type} · ${g.lanes.length}`}
                size="xxs"
                weight="bold"
                style={{ color: theme.colors.textDim }}
                numberOfLines={1}
              />
            </Pressable>
            {!collapsed[g.type] &&
              g.lanes.map((l) => (
                <View key={l.key} style={[$laneLabel, { borderBottomColor: theme.colors.border }]}>
                  <View
                    style={[
                      $dot,
                      {
                        backgroundColor: l.offSale
                          ? theme.colors.palette.danger
                          : l.unit.status === "dirty" || l.unit.status === "cleaning"
                            ? theme.colors.palette.warn
                            : theme.colors.palette.ok,
                      },
                    ]}
                  />
                  <Text
                    text={l.label}
                    size="xs"
                    weight="bold"
                    style={{ color: theme.colors.text }}
                    numberOfLines={1}
                  />
                </View>
              ))}
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[$head, $daysRow]}>
            {days.map((d, i) => (
              <View
                key={d}
                style={[
                  $dayHead,
                  i === todayIdx && { backgroundColor: theme.colors.palette.brandSoft },
                ]}
              >
                <Text
                  text={formatWeekday(d)}
                  size="xxs"
                  weight="bold"
                  style={{ color: theme.colors.text }}
                />
                <Text
                  text={`${load[i]?.pct ?? 0}% · ${load[i]?.free ?? 0}`}
                  size="xxs"
                  style={{ color: theme.colors.textFaint }}
                />
              </View>
            ))}
          </View>
          {groups.map((g) => (
            <View key={g.type}>
              <View
                style={[
                  $groupHead,
                  { width: DAY_W * days.length, backgroundColor: theme.colors.surface2 },
                ]}
              />
              {!collapsed[g.type] &&
                g.lanes.map((l) => (
                  <View
                    key={l.key}
                    style={[
                      $lane,
                      { width: DAY_W * days.length, borderBottomColor: theme.colors.border },
                    ]}
                  >
                    {days.map((d, i) => (
                      <Pressable
                        key={d}
                        onPress={() => onCell(l, d)}
                        disabled={l.offSale}
                        accessibilityLabel={`${l.label} ${d}`}
                        style={[
                          $cell,
                          { borderRightColor: theme.colors.border },
                          i === todayIdx && { backgroundColor: theme.colors.palette.brandSoft },
                        ]}
                      />
                    ))}
                    {!!l.offSale && (
                      <View
                        style={[
                          $blocked,
                          {
                            backgroundColor: theme.colors.palette.dangerSoft,
                            width: DAY_W * days.length,
                          },
                        ]}
                      >
                        <Text
                          text={l.unit.blocked_reason ?? ""}
                          size="xxs"
                          style={{ color: theme.colors.palette.danger }}
                          numberOfLines={1}
                        />
                      </View>
                    )}
                    {l.bars.map((b) => (
                      <Pressable
                        key={b.occupancy.booking_id + b.from}
                        onPress={() => onBar(b)}
                        onLongPress={() => onLongBar(b)}
                        accessibilityRole="button"
                        accessibilityLabel={`${b.occupancy.guest_name} ${l.label}`}
                        style={[
                          $bar,
                          {
                            left: b.from * DAY_W + DAY_W / 2,
                            width: (b.to - b.from) * DAY_W - 6,
                            backgroundColor: colour(b.occupancy.state),
                          },
                        ]}
                      >
                        <Text
                          text={`${b.occupancy.source === "website" ? "W · " : b.occupancy.source === "ota" ? "OTA · " : ""}${b.occupancy.guest_name}`}
                          size="xxs"
                          weight="bold"
                          style={{ color: theme.colors.palette.onSolid }}
                          numberOfLines={1}
                        />
                      </Pressable>
                    ))}
                  </View>
                ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row" }
const $head: ViewStyle = { height: 48 }
const $daysRow: ViewStyle = { flexDirection: "row" }
const $dayHead: ViewStyle = {
  width: DAY_W,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
}
const $groupHead: ViewStyle = { height: 26, justifyContent: "center", paddingHorizontal: 6 }
const $laneLabel: ViewStyle = {
  height: LANE_H,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 4,
  borderBottomWidth: 1,
}
const $dot: ViewStyle = { width: 6, height: 6, borderRadius: 3 }
const $lane: ViewStyle = {
  height: LANE_H,
  flexDirection: "row",
  borderBottomWidth: 1,
  position: "relative",
}
const $cell: ViewStyle = { width: DAY_W, height: LANE_H, borderRightWidth: 1 }
const $blocked: ViewStyle = {
  position: "absolute",
  top: 12,
  height: 20,
  justifyContent: "center",
  paddingHorizontal: 6,
  opacity: 0.9,
}
const $bar: ViewStyle = {
  position: "absolute",
  top: 8,
  height: 28,
  borderRadius: 8,
  paddingHorizontal: 6,
  justifyContent: "center",
}
