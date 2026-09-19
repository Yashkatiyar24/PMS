"use client"

/**
 * Every property of the trust the user may see the money of, side by side: how full tonight, what came in
 * today, who is arriving and leaving, what is owed. One tap moves the app to that property.
 */
import { useState } from "react"
import { Building2 } from "lucide-react"
import { api } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Empty, KV, Loading, PageHeader } from "@/components/ui"

type Row = {
  propertyId: string; propertyName: string; current: boolean; occupancyPct: number; collectedPaise: number; outstandingPaise: number
  inHouse: number; arrivals: number; departures: number; totalUnits: number; bookedUnits: number
}

export default function PortfolioPage() {
  const { t } = useI18n()
  const { switchProperty } = useSession()
  const { data, error } = useResource(() => api<Row[]>("/api/portfolio"), [], t("error.generic"))
  const [busy, setBusy] = useState(false)

  if (!data) return error ? <Banner tone="danger">{error}</Banner> : <Loading />
  const total = data.reduce((a, r) => ({ collected: a.collected + r.collectedPaise, owed: a.owed + r.outstandingPaise, inHouse: a.inHouse + r.inHouse }), { collected: 0, owed: 0, inHouse: 0 })

  return (
    <div className="space-y-4">
      <PageHeader title={t("portfolio.title")}
        subtitle={data.length > 0 ? `${t("reports.daily")} ${rupees(total.collected)} · ${t("reports.outstanding")} ${rupees(total.owed)} · ${t("today.inHouse")} ${total.inHouse}` : undefined} />
      {data.length === 0 ? <Empty icon={Building2}>{t("portfolio.none")}</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <Card key={r.propertyId} title={r.propertyName} action={r.current ? <Chip tone="brand" dot>{t("portfolio.current")}</Chip> : (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setBusy(true); void switchProperty(r.propertyId).then(() => { window.location.href = "/" }) }}>
                {t("portfolio.open")}
              </Button>
            )}>
              <p className="text-[32px] font-extrabold leading-none tabular-nums tracking-tight">{r.occupancyPct}%</p>
              <p className="mt-1 text-xs text-ink-soft">{t("reports.occupancy")} · {r.bookedUnits} / {r.totalUnits}</p>
              <dl className="mt-3">
                <KV label={t("reports.daily")} value={rupees(r.collectedPaise)} />
                <KV label={t("today.inHouse")} value={r.inHouse} />
                <KV label={t("today.arrivals")} value={r.arrivals} />
                <KV label={t("today.departures")} value={r.departures} />
                <KV label={t("reports.outstanding")} value={rupees(r.outstandingPaise)} tone={r.outstandingPaise > 0 ? "danger" : "ok"} />
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
