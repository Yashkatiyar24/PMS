import { View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Button,
  Chip,
  Empty,
  ErrorState,
  KV,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Text,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { percent, rupees } from "@/utils/format"

/** One card per property the user sees the accounts of; open switches the working property. */
export const PortfolioScreen = observer(function PortfolioScreen() {
  const navigation = useAppNavigation()
  const { auth } = useStores()
  const { theme } = useAppTheme()
  const rows = useResource(() => api.reports.portfolio(), [], { cacheKey: "portfolio" })
  const list = rows.data ?? []
  const totals = list.reduce(
    (s, r) => ({
      collected: s.collected + r.collectedPaise,
      due: s.due + r.outstandingPaise,
      inHouse: s.inHouse + r.inHouse,
    }),
    { collected: 0, due: 0, inHouse: 0 },
  )

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("portfolio.title")}
        subtitle={
          list.length
            ? `${translate("reports.daily")} ${rupees(totals.collected)} · ${translate("reports.outstanding")} ${rupees(totals.due)} · ${translate("today.inHouse")} ${totals.inHouse}`
            : undefined
        }
        onBack={() => navigation.goBack()}
      />
      {rows.loading && <Loading />}
      {rows.problem && !rows.data && (
        <ErrorState message={rows.problem.message} onRetry={rows.reload} />
      )}
      {rows.data && list.length === 0 && <Empty text={translate("portfolio.none")} />}
      {list.map((p) => (
        <Panel key={p.propertyId}>
          <View style={$head}>
            <View style={$fill}>
              <Text
                text={p.propertyName}
                preset="subheading"
                style={{ color: theme.colors.text }}
              />
              <Text
                text={`${p.bookedUnits}/${p.totalUnits}`}
                size="xs"
                style={{ color: theme.colors.textDim }}
              />
            </View>
            <Text text={percent(p.occupancyPct)} style={[$pct, { color: theme.colors.text }]} />
          </View>
          <KV label={translate("reports.daily")} value={rupees(p.collectedPaise)} />
          <KV label={translate("today.inHouse")} value={String(p.inHouse)} />
          <KV label={translate("reports.arrivals")} value={String(p.arrivals)} />
          <KV label={translate("reports.departures")} value={String(p.departures)} />
          <KV
            label={translate("reports.outstanding")}
            value={rupees(p.outstandingPaise)}
            tone={p.outstandingPaise > 0 ? "danger" : undefined}
          />
          {p.current ? (
            <Chip tone="ok" text={translate("portfolio.current")} />
          ) : (
            <Button
              preset="secondary"
              size="sm"
              text={translate("portfolio.open")}
              onPress={() => void auth.switchProperty(p.propertyId)}
            />
          )}
        </Panel>
      ))}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $head: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8 }
const $fill: ViewStyle = { flex: 1 }
const $pct: TextStyle = { fontSize: 28, fontWeight: "800" }
