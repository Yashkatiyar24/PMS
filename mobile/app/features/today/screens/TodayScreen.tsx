import { useState } from "react"
import { RefreshControl, View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Banner,
  Button,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  Screen,
  SectionLabel,
  StaleLabel,
  Switch,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { StayList } from "@/features/bookings/components/StayList"
import { OfflineBar } from "@/features/offline/components/OfflineBar"
import { useSyncReload } from "@/features/offline/hooks/useSyncReload"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDate } from "@/utils/date"

import { ActivityTiles, staysFor, type ActivityView } from "../components/ActivityTiles"
import { ForecastCard } from "../components/ForecastCard"
import { OccupancyCard } from "../components/OccupancyCard"

/** The front desk's day: occupancy, arrivals/departures/in-house and the forecast. Refreshes every 30 s. */
export const TodayScreen = observer(function TodayScreen() {
  const navigation = useAppNavigation()
  const { has } = usePermission()
  const [view, setView] = useState<ActivityView>("arrivals")
  const [showDone, setShowDone] = useState(false)
  const today = useResource(() => api.bookings.today(), [], {
    cacheKey: "today",
    refreshMs: 30_000,
  })
  useSyncReload(today.reload)
  const t = today.data

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: <RefreshControl refreshing={today.refreshing} onRefresh={today.reload} />,
      }}
    >
      <AppHeader />
      <OfflineBar />
      <PageHeader
        title={translate("nav.today")}
        subtitle={t ? formatDate(t.date) : undefined}
        actions={
          <>
            {has("reservations.create") && (
              <Button
                preset="secondary"
                size="sm"
                text={translate("action.add")}
                onPress={() => navigation.navigate("NewBooking")}
              />
            )}
            {has("checkin") && (
              <Button
                size="sm"
                text={translate("action.checkIn")}
                onPress={() => navigation.navigate("CheckIn")}
                testID="today-checkin"
              />
            )}
          </>
        }
      />
      {today.loading && <Loading />}
      {today.problem && !t && <ErrorState message={today.problem.message} onRetry={today.reload} />}
      {t && (
        <>
          <OccupancyCard today={t} />
          {t.flaggedNoShow.length > 0 && (
            <Banner
              tone="warn"
              text={`${translate("today.noShowFlagged")} · ${t.flaggedNoShow.length}`}
              actionText={translate("common.more")}
              onAction={() => setView("noShow")}
            />
          )}
          <SectionLabel text={translate("dash.activity")} />
          <ActivityTiles today={t} view={view} onChange={setView} />
          {view === "arrivals" && (
            <View style={$toggle}>
              <Switch
                value={showDone}
                onValueChange={setShowDone}
                label={translate("dash.showDone")}
                labelPosition="left"
              />
            </View>
          )}
          {view === "overbookings" ? (
            t.channelConflicts > 0 ? (
              <Banner
                tone="danger"
                text={translate("today.channelConflicts", { n: t.channelConflicts })}
                actionText={translate("dash.openChannels")}
                onAction={() => navigation.navigate("Channels")}
              />
            ) : (
              <Empty />
            )
          ) : view === "arrivals" &&
            t.arrivals.length === 0 &&
            !showDone &&
            t.arrived.length > 0 ? (
            <Empty text={translate("dash.allArrived")} />
          ) : (
            <StayList stays={staysFor(t, view, showDone)} />
          )}
          {today.fromCache && <StaleLabel fetchedAt={today.fetchedAt} />}
          {has("revenue.view") && <ForecastCard from={t.date} />}
        </>
      )}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $toggle: ViewStyle = { alignItems: "flex-end" }
