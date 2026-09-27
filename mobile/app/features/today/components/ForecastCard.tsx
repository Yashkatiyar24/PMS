import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Bars, Button, Loading, Panel, SectionLabel, StatTile, Text } from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { addDays, formatWeekday } from "@/utils/date"
import { percent, rupees } from "@/utils/format"

const DAYS = 14

/** The next fortnight: occupancy, room nights, revenue and a bar per night. Pager moves by 14 days. */
export function ForecastCard({ from }: { from: string }) {
  const { theme } = useAppTheme()
  const [offset, setOffset] = useState(0)
  const start = addDays(from, offset * DAYS)
  const forecast = useResource(() => api.reports.forecast(start, DAYS), [start], {
    cacheKey: `forecast.${start}`,
  })
  const f = forecast.data
  return (
    <View>
      <SectionLabel
        text={translate("dash.forecast")}
        right={
          <View style={$pager}>
            <Button
              preset="ghost"
              size="sm"
              text={translate("cal.earlier")}
              disabled={offset === 0}
              onPress={() => setOffset((o) => o - 1)}
            />
            <Button
              preset="ghost"
              size="sm"
              text={translate("cal.later")}
              onPress={() => setOffset((o) => o + 1)}
            />
          </View>
        }
      />
      <Panel>
        {!f && forecast.loading && <Loading rows={1} />}
        {f && (
          <>
            <View style={$tiles}>
              <StatTile
                label={translate("reports.occupancy")}
                value={percent(f.occupancyPct)}
                style={$tile}
              />
              <StatTile
                label={translate("dash.roomNights")}
                value={f.roomNights}
                tone="teal"
                style={$tile}
              />
              <StatTile
                label={translate("dash.revenue")}
                value={rupees(f.revenuePaise)}
                tone="ok"
                hint={translate("dash.beforeTax")}
                style={$tile}
              />
            </View>
            <Text
              text={translate("dash.nightly")}
              size="xs"
              style={{ color: theme.colors.textDim }}
            />
            <Bars
              bars={f.nights.map((n) => ({
                label: formatWeekday(n.date).slice(-2),
                value: n.occupancyPct,
              }))}
            />
          </>
        )}
      </Panel>
    </View>
  )
}

const $pager: ViewStyle = { flexDirection: "row" }
const $tiles: ViewStyle = { flexDirection: "row", gap: 8 }
const $tile: ViewStyle = { flex: 1, minWidth: 0 }
