"use client"

/**
 * The landing screen, and where most of the day happens: who is arriving, who is here, who is leaving,
 * and what is free. One big Check-in button, because that is the action the desk does most.
 */
import Link from "next/link"
import { LogIn, UserPlus } from "lucide-react"
import { api } from "@/lib/api"
import { useReloadAfterSync, useResource } from "@/lib/use-resource"
import { formatDate, formatTime, rupees } from "@/lib/format"
import type { Booking, Today } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Button, Card, Chip, Empty, Loading } from "@/components/ui"

export default function TodayPage() {
  const { t } = useI18n()
  const { data: today, error, reload } = useResource(() => api<Today>("/api/bookings/today"), [], t("error.generic"))

  // A finished sync may have created bookings that are not on screen yet.
  useReloadAfterSync(reload)

  if (error) return <Empty>{error}</Empty>
  if (!today) return <Loading />

  return (
    <div className="space-y-4">
      <Link href="/check-in" className="block">
        <Button className="w-full py-4 text-lg">
          <UserPlus size={22} aria-hidden /> {t("action.checkIn")}
        </Button>
      </Link>

      <Card>
        <h2 className="mb-2 font-semibold">{t("today.free")}</h2>
        {today.freeByType.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {today.freeByType.map((row) => (
              <li key={row.type_name}>
                <Chip tone={Number(row.free) > 0 ? "ok" : "danger"}>
                  {row.type_name}: {row.free}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Section title={t("today.arrivals")} bookings={today.arrivals} showArrive />
      <Section title={t("today.noShowFlagged")} bookings={today.flaggedNoShow} tone="warn" />
      <Section title={t("today.inHouse")} bookings={today.inHouse} />
      <Section title={t("today.departures")} bookings={today.departures} />
    </div>
  )
}

function Section({
  title,
  bookings,
  showArrive,
  tone,
}: {
  title: string
  bookings: Booking[]
  showArrive?: boolean
  tone?: "warn"
}) {
  const { t } = useI18n()
  if (bookings.length === 0 && tone === "warn") return null

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        {title} <Chip tone={tone ?? "neutral"}>{bookings.length}</Chip>
      </h2>
      {bookings.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <Link href={`/stays/${booking.id}`} className="block">
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{booking.guestName}</p>
                    <p className="truncate text-sm text-[var(--color-ink-soft)]">
                      {booking.units.map((u) => (u.bedLabel ? `${u.roomNumber}/${u.bedLabel}` : u.roomNumber)).join(", ") || "—"}
                      {" · "}
                      {formatDate(booking.arriveAt)} {formatTime(booking.arriveAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {booking.balanceDuePaise > 0 ? (
                      <Chip tone="danger">{rupees(booking.balanceDuePaise)}</Chip>
                    ) : (
                      <Chip tone="ok">{t("stay.paid")}</Chip>
                    )}
                    {showArrive && (
                      <p className="mt-1 flex items-center justify-end gap-1 text-xs text-[var(--color-brand)]">
                        <LogIn size={14} aria-hidden /> {t("action.arrive")}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
