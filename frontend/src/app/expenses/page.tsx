"use client"

/**
 * Money out, month by month: the total, what it went on, and every bill with a photo of the paper. A mistake
 * is voided with a reason and stays on the list struck through, so the month cannot change behind anyone's back.
 */
import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, FileText, Plus, ReceiptIndianRupee } from "lucide-react"
import { api, ApiError, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { useResource } from "@/lib/use-resource"
import { formatDate, rupees, toPaise } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Card, Chip, ChoiceChips, Empty, Field, IconButton, ListCard, ListRow, Loading, PageHeader, Sheet } from "@/components/ui"

const CATEGORIES = ["utilities", "maintenance", "salaries", "cleaning", "supplies", "food", "marketing", "other"] as const
const MODES = ["cash", "upi", "card", "bank", "cheque"] as const
type Expense = { id: string; spentOn: string; category: (typeof CATEGORIES)[number]; amountPaise: number; vendor: string; paymentMode: string; description: string; hasReceipt: boolean; voidedAt: string | null; voidReason: string | null; createdByName: string | null }
type Summary = { from: string; to: string; totalPaise: number; byCategory: Record<string, number>; expenses: Expense[] }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export default function ExpensesPage() {
  const { t, language } = useI18n()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const from = iso(month)
  const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const { data, error: loadError, reload } = useResource(() => api<Summary>(`/api/expenses?from=${from}&to=${to}`), [from, to], t("error.generic"))
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ spentOn: iso(new Date()), category: "utilities" as string, amount: "", vendor: "", paymentMode: "cash" as string, description: "" })
  const [bill, setBill] = useState<File | null>(null)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const created = await api<Expense>("/api/expenses", {
        method: "POST",
        body: { spentOn: form.spentOn, category: form.category, amountPaise: toPaise(form.amount), vendor: form.vendor, paymentMode: form.paymentMode, description: form.description },
      })
      if (bill) {
        const file = bill.type === "application/pdf" ? bill : await compressImage(bill, 400)
        await upload(`/api/expenses/${created.id}/receipt`, file, bill.type === "application/pdf" ? "bill.pdf" : "bill.jpg")
      }
      setAdding(false)
      setBill(null)
      setForm({ ...form, amount: "", vendor: "", description: "" })
    })

  const openBill = (e: Expense) => run(async () => { const { url } = await api<{ url: string }>(`/api/expenses/${e.id}/receipt-url`); window.open(url, "_blank") })
  const label = (c: string) => t(`expense.${c}` as "expense.other")
  const monthName = new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric" }).format(month)
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="space-y-4">
      <PageHeader title={t("expense.title")} back="/settings"
        actions={<Button size="sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> {t("action.add")}</Button>} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <IconButton label="‹" onClick={() => shift(-1)}><ChevronLeft size={20} aria-hidden /></IconButton>
          <p className="text-sm font-semibold text-ink-soft">{monthName}</p>
          <IconButton label="›" onClick={() => shift(1)}><ChevronRight size={20} aria-hidden /></IconButton>
        </div>
        {!data ? (loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading rows={1} />) : (
          <>
            <p className="mt-1 text-center text-[40px] font-extrabold leading-none tabular-nums tracking-tight">{rupees(data.totalPaise)}</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
              {Object.entries(data.byCategory).filter(([, v]) => v > 0).map(([c, v]) => (
                <li key={c} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold">{label(c)} {rupees(v)}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {data && (data.expenses.length === 0 ? <Empty icon={ReceiptIndianRupee} /> : (
        <ListCard>
          {data.expenses.map((e) => (
            <ListRow
              key={e.id}
              onClick={e.voidedAt ? undefined : () => { setVoiding(e); setReason("") }}
              leading={<Avatar icon={ReceiptIndianRupee} tone={e.voidedAt ? "neutral" : "warn"} size={38} />}
              title={<span className={e.voidedAt ? "line-through opacity-60" : ""}>{e.vendor || e.description || label(e.category)}</span>}
              subtitle={[formatDate(e.spentOn), label(e.category), e.paymentMode.toUpperCase(), e.voidReason].filter(Boolean).join(" · ")}
              right={
                <span className="flex items-center gap-1.5">
                  {e.hasReceipt && <IconButton label={t("expense.bill")} onClick={(ev) => { ev.stopPropagation(); void openBill(e) }}><FileText size={18} aria-hidden /></IconButton>}
                  <Chip tone={e.voidedAt ? "neutral" : "warn"}>{rupees(e.amountPaise)}</Chip>
                </span>
              }
            />
          ))}
        </ListCard>
      ))}

      <Sheet open={adding} onOpenChange={setAdding} title={t("expense.add")}
        footer={<Button size="lg" className="w-full" disabled={busy || toPaise(form.amount) <= 0 || !form.spentOn} onClick={save}>{t("action.save")}</Button>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="₹"><input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" autoFocus className="text-xl font-bold" /></Field>
            <Field label={t("res.col.dates")}><input type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} /></Field>
          </div>
          <Field label={t("stay.category")}>
            <ChoiceChips value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} />
          </Field>
          <Field label={t("expense.vendor")}><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
          <Field label={t("checkin.mode")}>
            <ChoiceChips value={form.paymentMode} onChange={(v) => setForm({ ...form, paymentMode: v })} options={MODES.map((m) => ({ value: m, label: m.toUpperCase() }))} />
          </Field>
          <Field label={t("common.details")}><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setBill(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}><FileText size={18} aria-hidden /> {t("expense.attachBill")}</Button>
            {bill && <Chip tone="ok">{bill.name}</Chip>}
          </div>
        </div>
      </Sheet>

      <Sheet open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title={t("expense.void")} description={voiding ? `${voiding.vendor || label(voiding.category)} · ${rupees(voiding.amountPaise)}` : undefined}
        footer={<Button variant="danger" size="lg" className="w-full" disabled={busy || !reason.trim()} onClick={() => voiding && run(async () => { await api(`/api/expenses/${voiding.id}/void`, { method: "POST", body: { reason } }); setVoiding(null) })}>{t("expense.void")}</Button>}>
        <Field label={t("common.reason")}><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </Sheet>
    </div>
  )
}
