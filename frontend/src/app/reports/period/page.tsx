"use client"

/**
 * Every report over a chosen stretch of days: today, yesterday, this week, this month, last month, or any
 * dates. Headline numbers first (occupancy, ADR, RevPAR, revenue, net), then each report folded away until
 * it is wanted, and the whole thing as a spreadsheet.
 */
import { useState } from "react"
import { BedDouble, Download, IndianRupee, Percent, RefreshCw, TrendingUp, Wallet } from "lucide-react"
import { api, API_BASE, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { dayKey, formatDate, formatDateTime, rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Banner, Button, Chip, Disclosure, Empty, Field, KV, ListCard, ListRow, Loading, Menu, PageHeader, Segmented, StatTile, type Tone } from "@/components/ui"

type Range = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom"
type Report = {
  from: string; to: string; days: number
  occupancy: { units: number; availableNights: number; nightsSold: number; occupancyPct: number; roomRevenuePaise: number; adrPaise: number; revparPaise: number }
  revenue: { lines: { item: string; taxable: number; tax: number }[]; totalPaise: number; taxPaise: number }
  tax: { tax_rate_bp: number; taxable: number; cgst: number; sgst: number; igst: number }[]
  bookings: { made: number; arrivals: number; departures: number; cancellations: number; noShows: number }
  sources: { source: string; bookings: number; nights: number; billed: number }[]
  payments: { mode: string; received: number; refunded: number; count: number }[]
  outstanding: { count: number; amountPaise: number }
  expenses: { byCategory: { category: string; amount: number }[]; totalPaise: number }
  net: { revenuePaise: number; expensesPaise: number; netPaise: number }
  housekeeping: { status: { status: string; rooms: number }[]; cleaned: { name: string; rooms: number }[] }
  maintenance: { opened: number; resolved: number; avg_hours: number; open_now: number; urgent_now: number }
  guests: { id: string; name: string; phone: string; city: string; stays: number; nights: number; paid: number }[]
}
type OnlineOrder = { id: string; bookingId: string; guestName: string; gatewayOrderId: string; amountPaise: number; status: string; gatewayPaymentId: string | null; failureReason: string | null; createdAt: string }
const ORDER_TONE: Record<string, Tone> = { created: "warn", paid: "ok", failed: "danger", expired: "neutral" }

/** The first and last day of a named range, in the desk's own calendar. */
function bounds(range: Exclude<Range, "custom">): [string, string] {
  const d = new Date()
  const day = (y: number, m: number, n: number) => dayKey(new Date(y, m, n))
  const y = d.getFullYear(), m = d.getMonth(), n = d.getDate()
  switch (range) {
    case "today": return [day(y, m, n), day(y, m, n)]
    case "yesterday": return [day(y, m, n - 1), day(y, m, n - 1)]
    case "week": { const monday = n - ((d.getDay() + 6) % 7); return [day(y, m, monday), day(y, m, n)] }
    case "month": return [day(y, m, 1), day(y, m, n)]
    case "lastMonth": return [day(y, m - 1, 1), day(y, m, 0)]
  }
}

export default function PeriodReportPage() {
  const { t } = useI18n()
  const label = (key: string, fallback: string) => { const v = t(key as Parameters<typeof t>[0]); return v === key ? fallback : v }
  const [range, setRange] = useState<Range>("month")
  const [custom, setCustom] = useState<[string, string]>(() => bounds("month"))
  const [from, to] = range === "custom" ? custom : bounds(range)
  const valid = !!from && !!to && from <= to
  const { data: report, error } = useResource(() => (valid ? api<Report>(`/api/reports/period?from=${from}&to=${to}`) : Promise.reject(new Error())), [from, to, valid], t("error.generic"))
  const { data: online, reload: reloadOnline } = useResource(
    () => api<{ enabled: boolean; orders: OnlineOrder[] }>(`/api/payments/online?from=${from}&to=${to}`), [from, to], t("error.generic"))
  const [checkError, setCheckError] = useState("")

  async function check(id: string) {
    setCheckError("")
    try { await api(`/api/payments/online/${id}/check`, { method: "POST" }); reloadOnline() }
    catch (e) { setCheckError(e instanceof ApiError ? e.message : t("error.generic")) }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("period.title")} subtitle={valid ? `${formatDate(from)} → ${formatDate(to)}` : undefined} back="/reports"
        actions={<Menu items={[{ label: `${t("period.title")} (CSV)`, icon: Download, href: `${API_BASE}/api/reports/period.csv?from=${from}&to=${to}` }]} />} />

      <Segmented value={range} onChange={setRange} items={([
        ["today", t("period.today")], ["yesterday", t("period.yesterday")], ["week", t("period.week")],
        ["month", t("period.month")], ["lastMonth", t("period.lastMonth")], ["custom", t("period.custom")],
      ] as const).map(([value, text]) => ({ value, label: text }))} />
      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("period.from")}><input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} /></Field>
          <Field label={t("period.to")}><input type="date" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} /></Field>
        </div>
      )}

      {!report ? (error && valid ? <Banner tone="danger">{error}</Banner> : <Loading />) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label={t("reports.occupancy")} value={`${report.occupancy.occupancyPct}%`} tone="brand" icon={BedDouble} hint={`${report.occupancy.nightsSold} / ${report.occupancy.availableNights}`} />
            <StatTile label="ADR" value={rupees(report.occupancy.adrPaise)} tone="teal" icon={TrendingUp} />
            <StatTile label="RevPAR" value={rupees(report.occupancy.revparPaise)} tone="violet" icon={Percent} />
            <StatTile label={t("period.revenue")} value={rupees(report.revenue.totalPaise)} tone="ok" icon={IndianRupee} />
            <StatTile label={t("expense.title")} value={rupees(report.expenses.totalPaise)} tone="warn" icon={Wallet} />
            <StatTile label={t("period.net")} value={rupees(report.net.netPaise)} tone={report.net.netPaise >= 0 ? "ok" : "danger"} icon={IndianRupee} />
          </div>

          <Disclosure title={t("period.revenue")} summary={rupees(report.revenue.totalPaise)} defaultOpen>
            <dl>{report.revenue.lines.map((l) => <KV key={l.item} label={label(`category.${l.item}`, label(`period.item.${l.item}`, l.item))} value={rupees(l.taxable)} />)}
              <KV label="GST" value={rupees(report.revenue.taxPaise)} strong /></dl>
          </Disclosure>

          <Disclosure title={t("period.bookings")} summary={`${report.bookings.made} · ${t("dash.cancellations")} ${report.bookings.cancellations} · ${t("state.no_show")} ${report.bookings.noShows}`}>
            <dl>
              <KV label={t("dash.bookingsMade")} value={report.bookings.made} />
              <KV label={t("reports.arrivals")} value={report.bookings.arrivals} />
              <KV label={t("reports.departures")} value={report.bookings.departures} />
              <KV label={t("dash.cancellations")} value={report.bookings.cancellations} />
              <KV label={t("state.no_show")} value={report.bookings.noShows} />
            </dl>
          </Disclosure>

          <Disclosure title={t("period.sources")} summary={report.sources.map((s) => `${label(`source.${s.source}`, s.source)} ${s.bookings}`).join(" · ") || undefined}>
            {report.sources.length === 0 ? <Empty /> : <Table head={[t("res.source"), t("period.bookings"), t("res.nights"), t("stay.total")]}
              rows={report.sources.map((s) => [label(`source.${s.source}`, s.source), s.bookings, s.nights, rupees(s.billed)])} />}
          </Disclosure>

          <Disclosure title={t("stay.payments")} summary={rupees(report.payments.reduce((a, p) => a + p.received - p.refunded, 0))}>
            {report.payments.length === 0 ? <Empty /> : <Table head={[t("checkin.mode"), t("period.received"), t("stay.refund"), "#"]}
              rows={report.payments.map((p) => [p.mode.toUpperCase(), rupees(p.received), rupees(p.refunded), p.count])} />}
            <dl className="mt-3"><KV label={t("reports.outstanding")} value={`${rupees(report.outstanding.amountPaise)} · ${report.outstanding.count}`} strong tone={report.outstanding.amountPaise > 0 ? "danger" : "ok"} /></dl>
          </Disclosure>

          {online?.enabled && (
            <Disclosure title={t("period.online")} summary={`${online.orders.filter((o) => o.status === "paid").length} / ${online.orders.length}`}>
              {checkError && <Banner tone="danger" onClose={() => setCheckError("")}>{checkError}</Banner>}
              {online.orders.length === 0 ? <Empty /> : (
                <ListCard className="border-0 shadow-none">
                  {online.orders.map((o) => (
                    <ListRow key={o.id} className="px-0" href={`/stays/${o.bookingId}`} chevron={false}
                      title={`${o.guestName} · ${rupees(o.amountPaise)}`}
                      subtitle={[formatDateTime(o.createdAt), o.gatewayPaymentId ?? o.gatewayOrderId, o.failureReason].filter(Boolean).join(" · ")}
                      right={
                        <span className="flex items-center gap-1.5">
                          {o.status === "created" && <Button size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); void check(o.id) }}><RefreshCw size={14} aria-hidden /> {t("period.check")}</Button>}
                          <Chip tone={ORDER_TONE[o.status] ?? "neutral"}>{label(`period.order.${o.status}`, o.status)}</Chip>
                        </span>
                      } />
                  ))}
                </ListCard>
              )}
            </Disclosure>
          )}

          <Disclosure title={t("expense.title")} summary={rupees(report.expenses.totalPaise)}>
            {report.expenses.byCategory.length === 0 ? <Empty /> : <dl>{report.expenses.byCategory.map((e) => <KV key={e.category} label={label(`expense.${e.category}`, e.category)} value={rupees(e.amount)} />)}</dl>}
          </Disclosure>

          <Disclosure title={t("period.gst")} summary={rupees(report.tax.reduce((a, r) => a + r.cgst + r.sgst + r.igst, 0))}>
            {report.tax.length === 0 ? <Empty /> : <Table head={[t("period.rate"), t("period.taxable"), "CGST", "SGST", "IGST"]}
              rows={report.tax.map((r) => [`${r.tax_rate_bp / 100}%`, rupees(r.taxable), rupees(r.cgst), rupees(r.sgst), rupees(r.igst)])} />}
          </Disclosure>

          <Disclosure title={t("rooms.assign")} summary={report.housekeeping.status.map((s) => `${label(`rooms.status.${s.status}`, s.status)} ${s.rooms}`).join(" · ")}>
            <dl>{report.housekeeping.status.map((s) => <KV key={s.status} label={label(`rooms.status.${s.status}`, s.status)} value={s.rooms} />)}</dl>
            {report.housekeeping.cleaned.length > 0 && (
              <>
                <h3 className="mb-1 mt-3 text-sm font-semibold text-ink-soft">{t("period.cleanedBy")}</h3>
                <dl>{report.housekeeping.cleaned.map((c) => <KV key={c.name} label={c.name} value={c.rooms} />)}</dl>
              </>
            )}
          </Disclosure>

          <Disclosure title={t("maint.title")} summary={`${report.maintenance.open_now} ${t("maint.openCount")}`}>
            <dl>
              <KV label={t("period.opened")} value={report.maintenance.opened} />
              <KV label={t("maint.status.resolved")} value={report.maintenance.resolved} />
              <KV label={t("period.avgHours")} value={report.maintenance.avg_hours} />
              <KV label={t("period.openNow")} value={report.maintenance.open_now} />
              <KV label={t("priority.urgent")} value={report.maintenance.urgent_now} tone={report.maintenance.urgent_now > 0 ? "danger" : undefined} />
            </dl>
          </Disclosure>

          <Disclosure title={t("period.guests")} summary={`${report.guests.length}`}>
            {report.guests.length === 0 ? <Empty /> : (
              <ListCard className="border-0 shadow-none">
                {report.guests.map((g) => (
                  <ListRow key={g.id} className="px-0" href={`/guests/${g.id}`} title={g.name} subtitle={[g.phone, g.city].filter(Boolean).join(" · ")}
                    right={<span className="text-sm tabular-nums">{g.nights} {t("res.nights")} · {rupees(g.paid)}</span>} />
                ))}
              </ListCard>
            )}
          </Disclosure>
        </>
      )}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[26rem] text-sm">
        <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <tr>{head.map((h, i) => <th key={i} className={`px-3 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((cells, r) => <tr key={r}>{cells.map((c, i) => <td key={i} className={`px-3 py-2 ${i > 0 ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

