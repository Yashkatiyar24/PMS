"use client"

/** What happened lately that this person's role cares about, newest first. Opening the list marks it read. */
import { useEffect } from "react"
import { AlertTriangle, BedDouble, Bell, BellRing, CreditCard, LogIn, Sparkles, Wrench, XCircle } from "lucide-react"
import { api } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDateTime } from "@/lib/format"
import type { Feed } from "@/lib/notifications"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Empty, ListCard, ListRow, Loading, PageHeader, type Tone } from "@/components/ui"

const LOOK: Record<string, { icon: typeof Bell; tone: Tone }> = {
  new_booking: { icon: BedDouble, tone: "brand" },
  booking_cancelled: { icon: XCircle, tone: "neutral" },
  payment_received: { icon: CreditCard, tone: "ok" },
  payment_failed: { icon: CreditCard, tone: "danger" },
  payment_after_expiry: { icon: AlertTriangle, tone: "danger" },
  payment_short: { icon: AlertTriangle, tone: "warn" },
  check_in: { icon: LogIn, tone: "teal" },
  checkout_reminder: { icon: BellRing, tone: "warn" },
  room_ready: { icon: Sparkles, tone: "ok" },
  room_dirty: { icon: BedDouble, tone: "warn" },
  maintenance: { icon: Wrench, tone: "danger" },
  low_stock: { icon: AlertTriangle, tone: "warn" },
}

export default function NotificationsPage() {
  const { t } = useI18n()
  const { data, error } = useResource(() => api<Feed>("/api/notifications"), [], t("error.generic"))

  // Seen once shown: tell the server, and let the menu's count catch up.
  useEffect(() => {
    if (!data || data.unread === 0) return
    api("/api/notifications/seen", { method: "POST" }).then(() => window.dispatchEvent(new CustomEvent("pms:notifications-seen"))).catch(() => {})
  }, [data])

  if (!data) return error ? <Banner tone="danger">{error}</Banner> : <Loading />
  return (
    <div className="space-y-4">
      <PageHeader title={t("notif.title")} subtitle={data.unread > 0 ? t("notif.new", { n: data.unread }) : undefined} />
      {data.items.length === 0 ? <Empty icon={Bell}>{t("notif.none")}</Empty> : (
        <ListCard>
          {data.items.map((n) => {
            const look = LOOK[n.kind] ?? { icon: Bell, tone: "neutral" as Tone }
            return (
              <ListRow key={n.id} href={n.link ?? undefined} leading={<Avatar icon={look.icon} tone={look.tone} size={38} />}
                title={<span className={n.unread ? "" : "font-medium text-ink-soft"}>{n.title}</span>}
                subtitle={[n.body, formatDateTime(n.createdAt)].filter(Boolean).join(" · ")}
                right={n.unread ? <span aria-label={t("notif.unread")} className="block h-2.5 w-2.5 rounded-full bg-brand" /> : undefined} />
            )
          })}
        </ListCard>
      )}
    </div>
  )
}
