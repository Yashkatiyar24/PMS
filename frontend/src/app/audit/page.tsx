"use client"

/**
 * Who changed what, and from what to what. Refunds, discounts, room moves, payments, invoices and permission
 * changes are all here; nothing in this list can be edited or removed by anyone, including the owner.
 */
import { useState } from "react"
import { ScrollText } from "lucide-react"
import { api } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { dayKey, formatDateTime } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Banner, Disclosure, Empty, Field, Loading, PageHeader } from "@/components/ui"

type Entry = { id: string; at: string; userName: string | null; table: string; rowId: string; action: string; before: string | null; after: string | null }

const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 7); return dayKey(d) }

export default function AuditPage() {
  const { t } = useI18n()
  const label = (key: string, fallback: string) => { const v = t(key as Parameters<typeof t>[0]); return v === key ? fallback : v }
  const [from, setFrom] = useState(weekAgo)
  const [to, setTo] = useState(() => dayKey(new Date()))
  const [table, setTable] = useState("")
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const { data: tables } = useResource(() => api<string[]>("/api/audit/tables"), [], t("error.generic"))
  const { data, error } = useResource(
    () => api<Entry[]>(`/api/audit?from=${from}&to=${to}${table ? `&table=${encodeURIComponent(table)}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`),
    [from, to, table, query], t("error.generic"))

  return (
    <div className="space-y-4">
      <PageHeader title={t("audit.title")} back="/settings" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label={t("period.from")}><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("period.to")}><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={t("audit.kind")}>
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">{t("common.all")}</option>
            {(tables ?? []).map((x) => <option key={x} value={x}>{label(`audit.table.${x}`, x)}</option>)}
          </select>
        </Field>
        <Field label={t("action.search")}>
          <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()) }}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQuery(q.trim())} /></form>
        </Field>
      </div>
      {!data ? (error ? <Banner tone="danger">{error}</Banner> : <Loading />) : data.length === 0 ? <Empty icon={ScrollText} /> : (
        <div className="space-y-2">
          {data.map((e) => (
            <Disclosure key={e.id}
              title={`${label(`activity.${e.table}.${e.action}`, e.action.replace(/_/g, " "))} · ${label(`audit.table.${e.table}`, e.table)}`}
              summary={`${formatDateTime(e.at)} · ${t("res.by", { name: e.userName ?? t("res.system") })}`}>
              <div className="grid gap-3 md:grid-cols-2">
                <Change title={t("audit.before")} json={e.before} />
                <Change title={t("audit.after")} json={e.after} />
              </div>
              <p className="mt-2 break-all font-mono text-xs text-ink-faint">{e.rowId}</p>
            </Disclosure>
          ))}
        </div>
      )}
    </div>
  )
}

function Change({ title, json }: { title: string; json: string | null }) {
  let text = "—"
  if (json) { try { text = JSON.stringify(JSON.parse(json), null, 2) } catch { text = json } }
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-xs font-semibold text-ink-soft">{title}</h3>
      <pre className="scroll-thin max-h-60 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{text}</pre>
    </div>
  )
}
