"use client"

/**
 * The landing screen, and where most of the day happens: who is arriving, who is here, who is leaving,
 * and what is free. Four numbers, one big Check-in button, and one list at a time — the number you tap.
 */
import { useState } from "react"
import Link from "next/link"
import { CalendarPlus, DoorOpen, LogIn, LogOut, Moon, UserPlus, Clock } from "lucide-react"
import { api } from "@/lib/api"
import { useReloadAfterSync, useResource } from "@/lib/use-resource"
import { formatDate, formatTime, rupees } from "@/lib/format"
import type { Booking, Today } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Chip, Empty, ListCard, ListRow, Loading, PageHeader, StatTile, type Tone } from "@/components/ui"

type View = "free" | "arrivals" | "inHouse" | "departures" | "noShow"

export default function TodayPage() {
  const { t } = useI18n()
  const { data: today, error, reload } = useResource(() => api<Today>("/api/bookings/today"), [], t("error.generic"))
  const [view, setView] = useState<View>("arrivals")

  // A finished sync may have created bookings that are not on screen yet.
  useReloadAfterSync(reload)

  if (error) return <Banner tone="danger">{error}</Banner>
  if (!today) return <Loading />

  const freeTotal = today.freeByType.reduce((sum, row) => sum + Number(row.free), 0)
  const freeHint = today.freeByType.map((row) => `${row.type_name} ${row.free}`).join(" · ")

  const lists: Record<View, { bookings: Booking[]; tone: Tone; showArrive?: boolean }> = {
    free: { bookings: [], tone: "ok" },
    arrivals: { bookings: today.arrivals, tone: "teal", showArrive: true },
    inHouse: { bookings: today.inHouse, tone: "brand" },
    departures: { bookings: today.departures, tone: "violet" },
    noShow: { bookings: today.flaggedNoShow, tone: "warn", showArrive: true },
  }
  const current = lists[view]

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.today")} subtitle={formatDate(today.date)} />

      <div className="flex gap-2">
        <Link href="/check-in" className="block flex-[2]">
          <Button size="lg" className="w-full">
            <UserPlus size={22} aria-hidden /> {t("action.checkIn")}
          </Button>
        </Link>
        <Link href="/bookings/new" className="block flex-1">
          <Button size="lg" variant="secondary" className="w-full">
            <CalendarPlus size={20} aria-hidden /> <span className="hidden sm:inline">{t("booking.new")}</span><span className="sm:hidden">{t("action.add")}</span>
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("today.free.short")} value={freeTotal} tone={freeTotal > 0 ? "ok" : "danger"} icon={DoorOpen} hint={freeHint || t("today.noneFree")} onClick={() => setView("free")} active={view === "free"} />
        <StatTile label={t("today.arrivals")} value={today.arrivals.length} tone="teal" icon={LogIn} hint={today.flaggedNoShow.length > 0 ? `${t("today.noShowFlagged")}: ${today.flaggedNoShow.length}` : undefined} onClick={() => setView("arrivals")} active={view === "arrivals"} />
        <StatTile label={t("today.inHouse")} value={today.inHouse.length} tone="brand" icon={Moon} onClick={() => setView("inHouse")} active={view === "inHouse"} />
        <StatTile label={t("today.departures")} value={today.departures.length} tone="violet" icon={LogOut} onClick={() => setView("departures")} active={view === "departures"} />
      </div>

      {today.flaggedNoShow.length > 0 && view !== "noShow" && (
        <button onClick={() => setView("noShow")} className="w-full text-left">
          <Banner tone="warn">
            <span className="flex items-center gap-2"><Clock size={16} aria-hidden /> {t("today.noShowFlagged")} · {today.flaggedNoShow.length}</span>
          </Banner>
        </button>
      )}

      {view === "free" ? (
        today.freeByType.length === 0 ? (
          <Empty>{t("today.noneFree")}</Empty>
        ) : (
          <ListCard>
            {today.freeByType.map((row) => (
              <ListRow
                key={row.type_name}
                leading={<Avatar name={row.type_name} tone={Number(row.free) > 0 ? "ok" : "danger"} icon={DoorOpen} />}
                title={row.type_name}
                right={<Chip tone={Number(row.free) > 0 ? "ok" : "danger"} dot>{t("today.units", { n: row.free })}</Chip>}
              />
            ))}
          </ListCard>
        )
      ) : current.bookings.length === 0 ? (
        <Empty />
      ) : (
        <ListCard>
          {current.bookings.map((booking) => (
            <StayRow key={booking.id} booking={booking} tone={current.tone} showArrive={current.showArrive} />
          ))}
        </ListCard>
      )}
    </div>
  )
}

function StayRow({ booking, tone, showArrive }: { booking: Booking; tone: Tone; showArrive?: boolean }) {
  const { t } = useI18n()
  const units = booking.units.map((u) => (u.bedLabel ? `${u.roomNumber}/${u.bedLabel}` : u.roomNumber)).join(", ") || "—"
  return (
    <ListRow
      href={`/stays/${booking.id}`}
      leading={<Avatar name={booking.guestName} tone={tone} />}
      title={booking.guestName}
      subtitle={`${units} · ${formatDate(booking.arriveAt)} ${formatTime(booking.arriveAt)}`}
      right={
        <div className="flex flex-col items-end gap-1">
          {booking.balanceDuePaise > 0 ? <Chip tone="danger">{rupees(booking.balanceDuePaise)}</Chip> : <Chip tone="ok">{t("stay.paid")}</Chip>}
          {showArrive && <span className="text-xs font-semibold text-brand-ink">{t("action.arrive")}</span>}
        </div>
      }
    />
  )
}
