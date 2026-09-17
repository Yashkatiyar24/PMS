"use client"

/**
 * What the owner and manager check: today's collection, the month for the accountant, who owes money,
 * who is holding cash, and the guest register the police ask for.
 */
import { useState } from "react"
import { Download, Send } from "lucide-react"
import { api, API_BASE, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Empty, Loading } from "@/components/ui"

type Daily = {
  businessDate: string
  collections: { mode: string; amount: number; count: number }[]
  collectedPaise: number
  cashByUser: { name: string; amount: number }[]
  arrivals: number
  departures: number
  noShows: number
  occupiedUnits: number
  sellableUnits: number
  occupancyPct: number
  outstandingCount: number
  outstandingPaise: number
  depositsHeldPaise: number
}

type Outstanding = { folio_id: string; booking_id: string; guest_name: string; phone: string; due_paise: number; arrive_at: string }
type Cash = { user_id: string; name: string; cash_paise: number; last_handover_at: string | null }

export default function ReportsPage() {
  const { t } = useI18n()
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [daily, outstanding, cash] = await Promise.all([
        api<Daily>("/api/reports/daily"),
        api<Outstanding[]>("/api/reports/outstanding"),
        api<Cash[]>("/api/reports/cash-in-hand"),
      ])
      return { daily, outstanding, cash }
    },
    [],
    t("error.generic"),
  )
  const daily = data?.daily ?? null
  const outstanding = data?.outstanding ?? []
  const cash = data?.cash ?? []
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function sendNow() {
    setBusy(true)
    try {
      await api("/api/reports/daily/send", { method: "POST" })
      setSent(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  async function handOver(userId: string) {
    setBusy(true)
    try {
      await api("/api/reports/cash-handover", { method: "POST", body: { userId, notes: "" } })
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (!daily) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  // The register window comes from the server's business date, not the browser clock.
  const to = daily.businessDate
  const from = new Date(`${to}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 7)
  const fromDate = from.toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("nav.reports")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}
      {sent && <Banner tone="info">{t("action.sendNow")} ✓</Banner>}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">{t("reports.daily")}</h2>
          <Chip>{formatDate(daily.businessDate)}</Chip>
        </div>
        <p className="text-3xl font-bold tabular-nums">{rupees(daily.collectedPaise)}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {daily.collections.map((row) => (
            <li key={row.mode}>
              <Chip>
                {row.mode}: {rupees(row.amount)}
              </Chip>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Stat label={t("reports.arrivals")} value={String(daily.arrivals)} />
          <Stat label={t("reports.departures")} value={String(daily.departures)} />
          <Stat label={t("reports.occupancy")} value={`${daily.occupancyPct}% (${daily.occupiedUnits}/${daily.sellableUnits})`} />
          <Stat label={t("reports.outstanding")} value={rupees(daily.outstandingPaise)} />
        </dl>
        <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={sendNow}>
          <Send size={16} aria-hidden /> {t("action.sendNow")}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">{t("reports.cash")}</h2>
        {cash.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2 text-sm">
            {cash.map((row) => (
              <li key={row.user_id} className="flex items-center justify-between gap-2">
                <span>{row.name}</span>
                <span className="flex items-center gap-2">
                  <b className="tabular-nums">{rupees(row.cash_paise)}</b>
                  {row.cash_paise > 0 && (
                    <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => handOver(row.user_id)}>
                      {t("action.handOver")}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">{t("reports.outstanding")}</h2>
        {outstanding.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2 text-sm">
            {outstanding.map((row) => (
              <li key={row.folio_id}>
                <a href={`/stays/${row.booking_id}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{row.guest_name}</span>
                    <span className="block text-xs text-[var(--color-ink-soft)]">{formatDate(row.arrive_at)}</span>
                  </span>
                  <Chip tone="danger">{rupees(row.due_paise)}</Chip>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">{t("reports.register")}</h2>
        <a href={`${API_BASE}/api/reports/police-register.csv?from=${fromDate}&to=${to}`} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full">
            <Download size={16} aria-hidden /> {t("reports.register")} (CSV)
          </Button>
        </a>
        <a href={`${API_BASE}/api/reports/month.csv`} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full">
            <Download size={16} aria-hidden /> {t("reports.month")} (CSV)
          </Button>
        </a>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
