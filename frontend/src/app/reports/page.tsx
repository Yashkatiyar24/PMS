"use client"

/**
 * What the owner and manager check: today's collection, the month for the accountant, who owes money,
 * who is holding cash, and the guest register the police ask for. Numbers first; lists fold away.
 */
import { useState } from "react"
import { ArrowDownToLine, BedDouble, Download, IndianRupee, LogIn, LogOut, Send, Wallet } from "lucide-react"
import { api, API_BASE, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Card, Chip, Disclosure, Empty, ListCard, ListRow, Loading, Menu, PageHeader, SectionLabel, StatTile } from "@/components/ui"

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
      const [daily, outstanding, cash] = await Promise.all([api<Daily>("/api/reports/daily"), api<Outstanding[]>("/api/reports/outstanding"), api<Cash[]>("/api/reports/cash-in-hand")])
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
  const cashTotal = cash.reduce((s, r) => s + r.cash_paise, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.reports")}
        subtitle={`${t("reports.period")} · ${formatDate(daily.businessDate)}`}
        actions={
          <Menu
            items={[
              { label: t("action.sendNow"), icon: Send, onSelect: () => void sendNow(), disabled: busy },
              { label: `${t("reports.register")} (CSV)`, icon: Download, href: `${API_BASE}/api/reports/police-register.csv?from=${fromDate}&to=${to}`, separator: true },
              { label: `${t("reports.month")} (CSV)`, icon: Download, href: `${API_BASE}/api/reports/month.csv` },
            ]}
          />
        }
      />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {sent && <Banner tone="ok" onClose={() => setSent(false)}>{t("action.sendNow")} ✓</Banner>}

      {/* Headline: today's money. */}
      <Card className="bg-gradient-to-br from-brand to-brand-strong text-white [&_*]:!text-white border-0">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("reports.daily")}</p>
        <p className="mt-1 text-[36px] font-bold leading-none tabular-nums tracking-tight">{rupees(daily.collectedPaise)}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {daily.collections.map((row) => (
            <li key={row.mode} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              {row.mode.toUpperCase()} {rupees(row.amount)} <span className="opacity-70">· {row.count}</span>
            </li>
          ))}
          {daily.collections.length === 0 && <li className="text-xs opacity-80">{t("common.none")}</li>}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("reports.occupancy")} value={`${daily.occupancyPct}%`} tone="brand" icon={BedDouble} hint={`${daily.occupiedUnits} / ${daily.sellableUnits}`} />
        <StatTile label={t("reports.arrivals")} value={daily.arrivals} tone="teal" icon={LogIn} hint={daily.noShows > 0 ? `${t("today.noShowFlagged")} ${daily.noShows}` : undefined} />
        <StatTile label={t("reports.departures")} value={daily.departures} tone="violet" icon={LogOut} />
        <StatTile label={t("reports.outstanding")} value={rupees(daily.outstandingPaise)} tone={daily.outstandingPaise > 0 ? "danger" : "ok"} icon={IndianRupee} hint={`${daily.outstandingCount}`} />
      </div>

      <SectionLabel>{t("common.details")}</SectionLabel>

      <Disclosure title={t("reports.cash")} summary={rupees(cashTotal)} defaultOpen={cashTotal > 0}>
        {cash.length === 0 ? (
          <Empty icon={Wallet} />
        ) : (
          <ListCard className="border-0 shadow-none">
            {cash.map((row) => (
              <ListRow
                key={row.user_id}
                className="px-0"
                leading={<Avatar name={row.name} tone="teal" size={36} />}
                title={row.name}
                subtitle={row.last_handover_at ? formatDate(row.last_handover_at) : undefined}
                right={
                  <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <b className="tabular-nums">{rupees(row.cash_paise)}</b>
                    {row.cash_paise > 0 && (
                      <Button variant="soft" size="sm" disabled={busy} onClick={() => handOver(row.user_id)}>
                        <ArrowDownToLine size={14} aria-hidden /> {t("action.handOver")}
                      </Button>
                    )}
                  </span>
                }
              />
            ))}
          </ListCard>
        )}
      </Disclosure>

      <Disclosure title={t("reports.outstanding")} summary={`${outstanding.length} · ${rupees(daily.outstandingPaise)}`} defaultOpen={outstanding.length > 0}>
        {outstanding.length === 0 ? (
          <Empty />
        ) : (
          <ListCard className="border-0 shadow-none">
            {outstanding.map((row) => (
              <ListRow
                key={row.folio_id}
                className="px-0"
                href={`/stays/${row.booking_id}`}
                leading={<Avatar name={row.guest_name} tone="danger" size={36} />}
                title={row.guest_name}
                subtitle={formatDate(row.arrive_at)}
                right={<Chip tone="danger">{rupees(row.due_paise)}</Chip>}
              />
            ))}
          </ListCard>
        )}
      </Disclosure>

      {daily.depositsHeldPaise > 0 && (
        <p className="px-1 text-xs text-ink-soft">{t("stay.deposit")}: {rupees(daily.depositsHeldPaise)}</p>
      )}
    </div>
  )
}
