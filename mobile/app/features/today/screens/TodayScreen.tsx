import { useState } from "react"
import { RefreshControl, View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Banner,
  Empty,
  ErrorState,
  Loading,
  Screen,
  SectionLabel,
  Segmented,
  StaleLabel,
  Switch,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { StayList } from "@/features/bookings/components/StayList"
import { OfflineBar } from "@/features/offline/components/OfflineBar"
import { useSyncReload } from "@/features/offline/hooks/useSyncReload"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"

import { staysFor, type ActivityView } from "../components/ActivityTiles"
import { ForecastCard } from "../components/ForecastCard"
import { HomeActions, type HomeAction } from "../components/HomeActions"
import { HomeGreeting } from "../components/HomeGreeting"
import { HomeHero } from "../components/HomeHero"
import { HomeTiles } from "../components/HomeTiles"

/** The front desk's day: occupancy, arrivals/departures/in-house and the forecast. Refreshes every 30 s. */
export const TodayScreen = observer(function TodayScreen() {
  const navigation = useAppNavigation()
  const { has } = usePermission()
  const { auth } = useStores()
  const [view, setView] = useState<ActivityView>("inHouse")
  const [showDone, setShowDone] = useState(false)
  const today = useResource(() => api.bookings.today(), [], {
    cacheKey: "today",
    refreshMs: 30_000,
  })
  useSyncReload(today.reload)
  const t = today.data

  // Only what this role may do: a square that refuses is worse than a square that is not there.
  const actions: HomeAction[] = [
    has("reservations.create") && {
      icon: "plus",
      label: translate("action.newBooking"),
      onPress: () => navigation.navigate("NewBooking"),
    },
    has("checkin") && {
      icon: "login",
      label: translate("action.checkIn"),
      onPress: () => navigation.navigate("CheckIn"),
    },
    {
      icon: "search",
      label: translate("mobile.findGuest"),
      // Across to another tab, which is the tab navigator's business rather than this stack's.
      onPress: () => navigation.getParent()?.navigate("GuestsTab" as never),
    },
    has("revenue.view") && {
      icon: "chart",
      label: translate("nav.reports"),
      onPress: () => navigation.getParent()?.navigate("ReportsTab" as never),
    },
  ].filter(Boolean) as HomeAction[]

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: <RefreshControl refreshing={today.refreshing} onRefresh={today.reload} />,
      }}
    >
      <OfflineBar />
      <HomeGreeting name={auth.user?.name ?? ""} date={t?.date} />
      {!!today.loading && <Loading />}
      {!!today.problem && !t && (
        <ErrorState message={today.problem.message} onRetry={today.reload} />
      )}
      {!!t && (
        <>
          <HomeHero today={t} />
          <HomeTiles today={t} />
          <HomeActions actions={actions} />
          {t.flaggedNoShow.length > 0 && (
            <Banner
              tone="warn"
              text={`${translate("today.noShowFlagged")} · ${t.flaggedNoShow.length}`}
              actionText={translate("common.more")}
              onAction={() => setView("noShow")}
            />
          )}
          <SectionLabel text={translate("mobile.inHouse")} />
          {/* The day's lists behind one pill track: the three numbers that matter are already in the tiles
              above, so repeating them as another row of big tiles only pushed the guests off the screen. */}
          <Segmented
            scroll
            value={view}
            onChange={setView}
            items={[
              { value: "inHouse", label: translate("today.inHouse"), count: t.inHouse.length },
              { value: "arrivals", label: translate("today.arrivals"), count: t.arrivals.length },
              {
                value: "departures",
                label: translate("today.departures"),
                count: t.departures.length,
              },
              { value: "booked", label: translate("dash.bookingsMade"), count: t.booked.length },
            ]}
          />
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
          {!!today.fromCache && <StaleLabel fetchedAt={today.fetchedAt} />}
          {has("revenue.view") && <ForecastCard from={t.date} />}
        </>
      )}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $toggle: ViewStyle = { alignItems: "flex-end" }
