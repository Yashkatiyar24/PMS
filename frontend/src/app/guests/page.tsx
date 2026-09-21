"use client"

/**
 * The guests, with whoever is in the house right now at the front.
 *
 * The desk's commonest question is not "who has ever stayed here" but "which of these people is which": three
 * families at the counter, and the one asking about hot water is in 104. So each guest staying tonight gets a
 * card of their own, with the room they hold, who is with them, until when and what is still owed — the four
 * things the desk needs before it says a word. The whole register is a tap away behind the same search as before.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, UserRound } from "lucide-react"
import { clsx } from "clsx"
import { api } from "@/lib/api"
import type { Booking, Guest } from "@/lib/types"
import { formatDate, formatTime, rupees, unitName } from "@/lib/format"
import { useAutoRefresh, useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Avatar, Card, Chip, Empty, KV, Loading, PageHeader, Segmented } from "@/components/ui"
import { SplitPage } from "@/components/SplitPage"

type Today = { inHouse: Booking[]; arrivals: Booking[]; departures: Booking[] }
type View = "staying" | "all"

/** Nights left to run, counted from tonight; 0 on the morning someone leaves. */
const nightsLeft = (departAt: string) => Math.max(0, Math.ceil((new Date(departAt).getTime() - Date.now()) / 86_400_000))

/** One fact under its own caption, as on the platform's property cards. */
function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className={clsx("truncate text-[15px] font-bold leading-tight tabular-nums", tone)}>{value}</dd>
    </div>
  )
}

/** A guest who is in the house: the card the desk reads across the counter. */
function StayingCard({ booking, leavingToday }: { booking: Booking; leavingToday: boolean }) {
  const { t } = useI18n()
  const rooms = booking.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ")
  const party = booking.adults + booking.children
  const due = booking.balanceDuePaise
  const nights = nightsLeft(booking.departAt)
  return (
    <li>
      {/* To the stay, not the profile: while someone is in the house, that is the record the desk works in. */}
      <Link
        href={`/stays/${booking.id}`}
        className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2!"
      >
        <div className="flex items-start gap-3">
          <Avatar name={booking.guestName} size={44} tone="warn" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-snug">{booking.guestName}</p>
            <p className="truncate text-sm tabular-nums text-ink-soft">{booking.guestPhone || "—"}</p>
          </div>
          {/* The room is what tells one family at the counter from the next, so it carries the most weight. */}
          {rooms && (
            <span className="shrink-0 rounded-xl bg-teal-soft px-2.5 py-1 text-center">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-teal">{t("dash.col.room")}</span>
              <span className="block text-[15px] font-extrabold leading-tight text-teal">{rooms}</span>
            </span>
          )}
        </div>

        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 px-3 py-2">
          <Fact label={t("guests.people")} value={party} />
          <Fact label={t("guests.nightsLeft")} value={nights} />
          <Fact label={t("dash.col.balance")} value={due > 0 ? rupees(due) : t("payment.paid")} tone={due > 0 ? "text-danger" : "text-ok"} />
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <span className="truncate">{t("guests.until", { date: formatDate(booking.departAt) })}</span>
          {booking.checkedInAt && <span className="truncate">· {t("guests.arrivedAt", { time: formatTime(booking.checkedInAt) })}</span>}
          {leavingToday && <Chip tone="violet">{t("today.departures")}</Chip>}
        </div>
      </Link>
    </li>
  )
}

/** Someone from the register, whether or not they are here today. */
function GuestCard({ guest }: { guest: Guest }) {
  return (
    <li>
      <Link
        href={`/guests/${guest.id}`}
        className="flex h-full items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2!"
      >
        <Avatar name={guest.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-snug">{guest.name}</p>
          <p className="truncate text-sm tabular-nums text-ink-soft">{guest.phone || guest.email || "—"}</p>
          {(guest.city || guest.idType) && (
            <p className="truncate text-xs text-ink-faint">{[guest.city, guest.idLast4 && `••${guest.idLast4}`].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </Link>
    </li>
  )
}

export default function GuestsPage() {
  const { t } = useI18n()
  const [view, setView] = useState<View>("staying")
  const [query, setQuery] = useState("")
  const [guests, setGuests] = useState<Guest[] | null>(null)

  // Who is in the house comes from the same call the Today screen makes, so the two never disagree.
  const { data: today, reload } = useResource(() => api<Today>("/api/bookings/today"), [], t("error.generic"))
  useAutoRefresh(reload)

  // Ask once the typing pauses, so a fast typist sends one request, not ten.
  useEffect(() => {
    if (view !== "all") return
    let live = true
    const timer = setTimeout(() => {
      api<Guest[]>(`/api/guests?q=${encodeURIComponent(query.trim())}`)
        .then((found) => { if (live) setGuests(found) })
        .catch(() => { if (live) setGuests([]) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query, view])

  const inHouse = today?.inHouse ?? []
  const leavingToday = new Set((today?.departures ?? []).map((b) => b.id))
  // Two to a row at most: a guest card carries a name, a room and three figures, and a third column would
  // start cutting the names off. The register's own cards are plainer, so they take three.
  const staying = "grid gap-4 lg:grid-cols-2"
  const register = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"

  return (
    <div className="space-y-4">
      <PageHeader title={t("guests.title")} />
      <SplitPage asideFirst aside={
        <Card>
          <Segmented
            value={view}
            onChange={setView}
            items={[
              { value: "staying", label: t("today.inHouse"), count: inHouse.length, tone: "warn" },
              { value: "all", label: t("guests.all") },
            ]}
          />
          {view === "all" && (
            <label className="relative mt-3 block">
              <span className="sr-only">{t("guests.search")}</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("guests.search")} className="!rounded-full !pl-10" autoFocus />
            </label>
          )}
          <dl className="mt-3 divide-y divide-line">
            {view === "staying" ? (
              <>
                <KV label={t("today.inHouse")} value={inHouse.length} />
                <KV label={t("today.departures")} value={leavingToday.size} />
                <KV label={t("today.arrivals")} value={(today?.arrivals ?? []).length} />
                <KV label={t("dash.col.balance")} value={rupees(inHouse.reduce((n, b) => n + Math.max(0, b.balanceDuePaise), 0))} />
              </>
            ) : (
              <KV label={t("guests.title")} value={guests?.length ?? "—"} />
            )}
          </dl>
        </Card>
      }>
        {view === "staying" ? (
          !today ? <Loading /> : inHouse.length === 0 ? <Empty icon={UserRound}>{t("guests.noneStaying")}</Empty> : (
            <ul className={staying}>
              {inHouse.map((b) => <StayingCard key={b.id} booking={b} leavingToday={leavingToday.has(b.id)} />)}
            </ul>
          )
        ) : guests === null ? <Loading /> : guests.length === 0 ? <Empty icon={UserRound}>{t("search.none")}</Empty> : (
          <ul className={register}>
            {guests.map((g) => <GuestCard key={g.id} guest={g} />)}
          </ul>
        )}
      </SplitPage>
    </div>
  )
}
