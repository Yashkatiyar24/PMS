"use client"

/**
 * The dashboard, and where most of the day starts. On the left the day itself and how full tonight is; on the
 * right the day's activity, one list at a time — the number you tap. The owner also sees the next two weeks
 * as booked: occupancy, room nights, average rate, revenue per room and revenue.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, UserPlus } from "lucide-react"
import { clsx } from "clsx"
import { api } from "@/lib/api"
import { useAutoRefresh, useReloadAfterSync, useResource } from "@/lib/use-resource"
import { formatDate, rupees, unitName } from "@/lib/format"
import type { Booking, BookingState, Forecast, Today } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, Empty, IconButton, Loading, type Tone } from "@/components/ui"

type View = "arrivals" | "departures" | "inHouse" | "stayovers" | "booked" | "cancelled" | "overbookings" | "noShow"

const STATE_TONE: Record<BookingState, Tone> = { pending: "warn", reserved: "brand", checked_in: "ok", checked_out: "neutral", no_show: "danger", cancelled: "neutral" }
const DAY = 86_400_000
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const nights = (b: Booking) => Math.max(1, Math.round((Date.parse(b.departAt) - Date.parse(b.arriveAt)) / DAY))

/** The desk's landing screen. A role with no desk work (housekeeping, maintenance) lands on the rooms instead. */
export default function TodayPage() {
  const { user, has } = useSession()
  const router = useRouter()
  const desk = !user || has("reservations.view")
  useEffect(() => { if (!desk) router.replace("/rooms") }, [desk, router])
  return desk ? <Dashboard /> : <Loading />
}

function Dashboard() {
  const { t, language } = useI18n()
  const { has } = useSession()
  const { data: today, error, reload } = useResource(() => api<Today>("/api/bookings/today"), [], t("error.generic"))
  const [view, setView] = useState<View>("arrivals")
  const [showDone, setShowDone] = useState(false)

  // A finished sync may have created bookings that are not on screen yet.
  useReloadAfterSync(reload)
  // Other desks and housekeeping change the day too; keep it current without a refresh.
  useAutoRefresh(reload)

  if (error) return <Banner tone="danger">{error}</Banner>
  if (!today) return <Loading />

  const departing = new Set(today.departures.map((b) => b.id))
  const lists: Record<View, Booking[]> = {
    arrivals: showDone ? [...today.arrivals, ...today.arrived] : today.arrivals,
    departures: today.departures,
    inHouse: today.inHouse,
    stayovers: today.inHouse.filter((b) => !departing.has(b.id)),
    booked: today.booked,
    cancelled: today.cancelled,
    overbookings: [],
    noShow: today.flaggedNoShow,
  }
  const allArrived = today.arrivals.length === 0 && today.arrived.length > 0
  const tabs: { view: View; label: string; count: number; done?: boolean; alert?: boolean }[] = [
    { view: "arrivals", label: t("today.arrivals"), count: today.arrivals.length + today.arrived.length, done: allArrived },
    { view: "departures", label: t("today.departures"), count: today.departures.length },
    { view: "inHouse", label: t("today.inHouse"), count: today.inHouse.length },
    { view: "stayovers", label: t("dash.stayovers"), count: lists.stayovers.length },
    { view: "booked", label: t("dash.bookingsMade"), count: today.booked.length },
    { view: "cancelled", label: t("dash.cancellations"), count: today.cancelled.length },
    { view: "overbookings", label: t("dash.overbookings"), count: today.channelConflicts, alert: today.channelConflicts > 0 },
  ]
  const arriving = today.arrivals.reduce((sum, b) => sum + b.adults + b.children, 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("nav.today")}</h1>
          <p className="text-sm text-ink-soft">{formatDate(today.date)}</p>
        </div>
        {/* Thumb-wide on a phone; on a laptop the buttons keep a button's size. */}
        <div className="flex w-full gap-2 sm:w-auto">
          <Link href="/check-in" className="block flex-[2] sm:flex-none">
            <Button size="lg" className="w-full sm:px-8">
              <UserPlus size={20} aria-hidden /> {t("action.checkIn")}
            </Button>
          </Link>
          <Link href="/bookings/new" className="block flex-1 sm:flex-none">
            <Button size="lg" variant="secondary" className="w-full whitespace-nowrap">
              <CalendarPlus size={20} aria-hidden /> <span className="hidden sm:inline">{t("booking.new")}</span><span className="sm:hidden">{t("action.add")}</span>
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="grid gap-4 lg:content-start">
          <DateCard iso={today.date} language={language} />
          <OccupancyCard today={today} />
        </aside>

        <section className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] md:p-5">
          <h2 className="mb-3 text-lg font-bold tracking-tight">{t("dash.activity")}</h2>
          <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:grid xl:grid-cols-7 xl:overflow-visible">
            {tabs.map((tab) => (
              <button
                key={tab.view}
                onClick={() => setView(tab.view)}
                aria-pressed={view === tab.view}
                className={clsx(
                  "flex min-w-[7.5rem] shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors xl:min-w-0",
                  view === tab.view ? "border-brand bg-brand-soft/60 ring-1 ring-inset ring-brand" : "border-line hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className={clsx("text-2xl font-extrabold tabular-nums leading-none", tab.alert && "text-danger")}>{tab.count}</span>
                  {tab.done && <CheckCircle2 size={16} aria-hidden className="text-ok" />}
                  {tab.alert && <AlertTriangle size={16} aria-hidden className="text-danger" />}
                </span>
                <span className="text-[13px] font-semibold leading-tight text-ink-soft">{tab.label}</span>
              </button>
            ))}
          </div>

          {today.flaggedNoShow.length > 0 && view !== "noShow" && (
            <button onClick={() => setView("noShow")} className="mt-3 w-full text-left">
              <Banner tone="warn">
                <span className="flex items-center gap-2"><Clock size={16} aria-hidden /> {t("today.noShowFlagged")} · {today.flaggedNoShow.length}</span>
              </Banner>
            </button>
          )}

          <div className="mt-4">
            {view === "overbookings" ? (
              today.channelConflicts > 0 ? (
                <Link href="/settings/channels" className="block">
                  <Banner tone="danger">{t("today.channelConflicts", { n: today.channelConflicts })} · {t("dash.openChannels")}</Banner>
                </Link>
              ) : <Empty icon={CheckCircle2} />
            ) : view === "arrivals" && allArrived && !showDone ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
                <CheckCircle2 size={32} aria-hidden className="text-ok" />
                <p className="font-semibold">{t("dash.allArrived")}</p>
              </div>
            ) : lists[view].length === 0 ? (
              <Empty />
            ) : (
              <StayTable bookings={lists[view]} />
            )}
          </div>

          {view === "arrivals" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 text-sm">
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" role="switch" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                <span className="font-medium">{t("dash.showDone")}</span>
              </label>
              <span className="text-ink-soft">{t("book.guests")}: <b className="tabular-nums text-ink">{arriving}</b></span>
            </div>
          )}
        </section>
      </div>

      {has("revenue.view") && <ForecastCard start={today.date} />}
    </div>
  )
}

function DateCard({ iso, language }: { iso: string; language: string }) {
  const date = new Date(`${iso}T00:00:00`)
  const locale = language === "hi" ? "hi-IN" : "en-IN"
  return (
    // The header already says the date on a phone; the big date card is for a laptop.
    <div className="hidden flex-col justify-center rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] lg:flex">
      <p className="text-sm font-semibold text-ink-soft">{new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date)}</p>
      <p className="text-6xl font-extrabold leading-none tracking-tight tabular-nums">{date.getDate()}</p>
      <p className="mt-1 text-sm font-semibold text-ink-soft">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date)}</p>
    </div>
  )
}

/** Tonight at a glance: a ring for how full, and the numbers behind it. */
function OccupancyCard({ today }: { today: Today }) {
  const { t } = useI18n()
  const sellable = Math.max(0, today.totalUnits - today.blockedUnits)
  const pct = sellable === 0 ? 0 : Math.round((today.bookedUnits * 1000) / sellable) / 10
  const available = Math.max(0, sellable - today.bookedUnits)
  const r = 44
  const circumference = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] lg:block">
      <div className="relative aspect-square w-32 shrink-0 lg:mx-auto lg:w-full lg:max-w-[9.5rem]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-line" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" style={{ stroke: "var(--color-chart)" }}
            strokeDasharray={`${(circumference * Math.min(100, pct)) / 100} ${circumference}`} />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight">{pct}%</span>
          <span className="text-[11px] font-semibold text-ink-soft">{t("dash.occupancy")}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
      <dl className="space-y-1.5 text-sm lg:mt-4">
        {[
          [t("dash.available"), available],
          [t("dash.booked"), today.bookedUnits],
          [t("dash.outOfService"), today.blockedUnits],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex items-center justify-between gap-2">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {today.freeByType.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
          {today.freeByType.map((row) => (
            <li key={row.type_name} className="flex justify-between gap-2">
              <span className="truncate">{row.type_name}</span>
              <span className="font-semibold tabular-nums text-ink">{t("dash.free", { n: row.free })}</span>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}

/** A table on a laptop, stacked rows on a phone: guest, room, stay, status, balance. */
function StayTable({ bookings }: { bookings: Booking[] }) {
  const { t } = useI18n()
  const cols = "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.6fr)_7.5rem_6.5rem] md:items-center md:gap-4"
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className={clsx("hidden bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft", cols)}>
        <span>{t("dash.col.guest")}</span><span>{t("dash.col.room")}</span><span>{t("dash.col.stay")}</span><span>{t("dash.col.status")}</span><span className="text-right">{t("dash.col.balance")}</span>
      </div>
      <ul className="divide-y divide-line">
        {bookings.map((b) => {
          const units = b.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ") || "—"
          const n = nights(b)
          return (
            <li key={b.id}>
              <Link href={`/stays/${b.id}`} className={clsx("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2", cols)}>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={b.guestName} tone={STATE_TONE[b.state]} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{b.guestName}</span>
                    <span className="block truncate text-xs text-ink-soft md:hidden">{units} · {formatDate(b.arriveAt)} → {formatDate(b.departAt)}</span>
                    {b.guestPhone && <span className="hidden truncate text-xs text-ink-soft md:block">{b.guestPhone}</span>}
                  </span>
                </span>
                <span className="hidden truncate font-semibold tabular-nums md:block">{units}</span>
                <span className="hidden text-sm md:block">
                  {formatDate(b.arriveAt)} → {formatDate(b.departAt)}
                  <span className="block text-xs text-ink-soft">{n === 1 ? t("book.oneNight") : t("book.nights", { n })}</span>
                </span>
                <span className="hidden md:block"><Chip tone={STATE_TONE[b.state]} dot>{t(`state.${b.state}` as "state.reserved")}</Chip></span>
                <span className="shrink-0 text-right">
                  {b.balanceDuePaise > 0 ? <Chip tone="danger">{rupees(b.balanceDuePaise)}</Chip> : <Chip tone="ok">{t("stay.paid")}</Chip>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The next fortnight as booked: five numbers, then how full each night is. */
function ForecastCard({ start }: { start: string }) {
  const { t, language } = useI18n()
  const [offset, setOffset] = useState(0)
  const from = addDays(start, offset)
  const { data: f } = useResource(() => api<Forecast>(`/api/reports/forecast?from=${from}&days=14`), [from], t("error.generic"))
  const [hover, setHover] = useState<number | null>(null)
  const weekday = new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t("dash.forecast")}</h2>
          <p className="text-xs text-ink-soft">{t("dash.beforeTax")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
          <IconButton label={t("cal.earlier")} disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 14))} className="rounded-full"><ChevronLeft size={18} aria-hidden /></IconButton>
          <span className="px-2 text-sm font-semibold tabular-nums">{formatDate(from)} – {formatDate(addDays(from, 13))}</span>
          <IconButton label={t("cal.later")} onClick={() => setOffset((o) => o + 14)} className="rounded-full"><ChevronRight size={18} aria-hidden /></IconButton>
        </div>
      </div>

      {!f ? <div className="mt-4"><Loading rows={1} /></div> : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              [t("reports.occupancy"), `${f.occupancyPct}%`],
              [t("dash.roomNights"), String(f.roomNights)],
              [t("dash.adr"), rupees(f.adrPaise)],
              [t("dash.revpar"), rupees(f.revparPaise)],
              [t("dash.revenue"), rupees(f.revenuePaise)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line px-3.5 py-3">
                <dd className="text-xl font-extrabold tabular-nums tracking-tight">{value}</dd>
                <dt className="text-xs font-medium text-ink-soft">{label}</dt>
              </div>
            ))}
          </dl>

          {/* One series, one hue: nightly occupancy. The title names it, so there is no legend. */}
          <figure className="mt-5">
            <figcaption className="mb-2 text-sm font-semibold">{t("dash.nightly")}</figcaption>
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
              <span className="pointer-events-none absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-ink-faint" aria-hidden>100%</span>
              <ol className="flex h-36 items-end gap-[2px] border-b border-line-strong" aria-hidden>
                {f.nights.map((n, i) => (
                  <li key={n.date} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <span
                      className={clsx("block w-full rounded-t-[4px] transition-opacity", hover !== null && hover !== i && "opacity-40")}
                      style={{ height: `${Math.min(100, n.occupancyPct)}%`, background: "var(--color-chart)" }}
                    />
                    {hover === i && (
                      <span className="anim-pop absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-bg shadow-[var(--shadow-pop)]">
                        <b>{weekday.format(new Date(`${n.date}T00:00:00`))} {formatDate(n.date)}</b> · {n.occupancyPct}% · {n.sold}/{f.units}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <ol className="mt-1.5 flex gap-[2px] text-center text-[10px] text-ink-soft" aria-hidden>
                {f.nights.map((n) => (
                  <li key={n.date} className="flex-1 truncate">{new Date(`${n.date}T00:00:00`).getDate()}</li>
                ))}
              </ol>
            </div>
            <table className="sr-only">
              <caption>{t("dash.nightly")}</caption>
              <tbody>{f.nights.map((n) => <tr key={n.date}><th>{formatDate(n.date)}</th><td>{n.occupancyPct}%</td><td>{n.sold}</td></tr>)}</tbody>
            </table>
          </figure>
        </>
      )}
    </section>
  )
}
