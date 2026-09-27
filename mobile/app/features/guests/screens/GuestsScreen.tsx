import { useEffect, useState } from "react"
import { RefreshControl, View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Avatar,
  Chip,
  Empty,
  Input,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Segmented,
  StaleLabel,
} from "@/components"
import { AppHeader } from "@/components/AppHeader"
import { stateTone } from "@/features/bookings/lib/bookingLabels"
import type { Booking } from "@/features/bookings/types"
import { OfflineBar } from "@/features/offline/components/OfflineBar"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { diffInDays, formatDate, formatTime, isToday } from "@/utils/date"
import { formatPhone, rupees, unitName } from "@/utils/format"

import type { Guest } from "../types"

type View_ = "inHouse" | "all"

/** Who is in the house now, and the whole register with search. */
export const GuestsScreen = observer(function GuestsScreen() {
  const navigation = useAppNavigation()
  const [view, setView] = useState<View_>("inHouse")
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Guest[] | null>(null)
  const today = useResource(() => api.bookings.today(), [], {
    cacheKey: "today",
    refreshMs: 30_000,
  })

  useEffect(() => {
    if (view !== "all") return
    const timer = setTimeout(async () => {
      const r = await api.guests.search(q.trim())
      setResults(r.ok ? r.data : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [q, view])

  const t = today.data
  const inHouse = t?.inHouse ?? []
  const balance = inHouse.reduce((s, b) => s + Math.max(0, b.balanceDuePaise), 0)

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
      <PageHeader title={translate("guests.title")} />
      <Segmented<View_>
        value={view}
        onChange={setView}
        items={[
          { value: "inHouse", label: translate("today.inHouse"), count: inHouse.length },
          { value: "all", label: translate("guests.all") },
        ]}
      />
      {view === "inHouse" && t && (
        <Panel>
          <KV label={translate("today.inHouse")} value={String(inHouse.length)} />
          <KV label={translate("today.departures")} value={String(t.departures.length)} />
          <KV label={translate("today.arrivals")} value={String(t.arrivals.length)} />
          <KV
            label={translate("stay.balance")}
            value={rupees(balance)}
            tone={balance > 0 ? "danger" : "ok"}
            strong
          />
        </Panel>
      )}
      {view === "inHouse" && today.loading && <Loading />}
      {view === "inHouse" &&
        t &&
        (inHouse.length === 0 ? (
          <Empty text={translate("guests.noneStaying")} />
        ) : (
          <ListCard>
            {inHouse.map((b, i) => (
              <StayingRow
                key={b.id}
                b={b}
                leavingToday={t.departures.some((d) => d.id === b.id)}
                last={i === inHouse.length - 1}
              />
            ))}
          </ListCard>
        ))}
      {view === "inHouse" && today.fromCache && <StaleLabel fetchedAt={today.fetchedAt} />}
      {view === "all" && (
        <>
          <Input
            value={q}
            onChangeText={setQ}
            placeholder={translate("guests.search")}
            autoCorrect={false}
            returnKeyType="search"
          />
          {results === null && <Loading rows={2} />}
          {results && results.length === 0 && <Empty text={translate("search.none")} />}
          {results && results.length > 0 && (
            <ListCard>
              {results.map((g, i) => (
                <ListRow
                  key={g.id}
                  leading={<Avatar name={g.name} tone="warn" />}
                  title={g.name}
                  subtitle={`${formatPhone(g.phone) || g.email || ""}${g.city ? ` · ${g.city}` : ""}${g.idLast4 ? ` · ••${g.idLast4}` : ""}`}
                  onPress={() => navigation.navigate("Guest", { id: g.id })}
                  last={i === results.length - 1}
                />
              ))}
            </ListCard>
          )}
        </>
      )}
    </Screen>
  )
})

function StayingRow({
  b,
  leavingToday,
  last,
}: {
  b: Booking
  leavingToday: boolean
  last: boolean
}) {
  const navigation = useAppNavigation()
  const nightsLeft = Math.max(0, diffInDays(new Date(), b.departAt))
  const units = b.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ")
  return (
    <ListRow
      leading={<Avatar name={b.guestName} tone={stateTone(b.state)} />}
      title={b.guestName}
      subtitle={`${units} · ${translate("guests.party", { n: b.adults + b.children })} · ${translate("guests.nightsLeft")} ${nightsLeft} · ${translate("guests.until", { date: formatDate(b.departAt) })}${b.checkedInAt && isToday(b.checkedInAt) ? ` · ${translate("guests.arrivedAt", { time: formatTime(b.checkedInAt) })}` : ""}`}
      right={
        <View style={$chips}>
          {leavingToday && <Chip tone="warn" text={translate("today.departures")} />}
          <Chip
            tone={b.balanceDuePaise > 0 ? "danger" : "ok"}
            text={b.balanceDuePaise > 0 ? rupees(b.balanceDuePaise) : translate("stay.paid")}
          />
        </View>
      }
      onPress={() => navigation.navigate("Stay", { id: b.id })}
      last={last}
    />
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $chips: ViewStyle = { alignItems: "flex-end", gap: 4 }
