"use client"

/**
 * One stay: who is in which room, what they owe, and the two buttons the desk needs most — take payment and
 * check out. Everything else (extras, invoice, cancel, no-show) waits behind the menu. Charges the engine
 * generated are shown but not editable; the way to change them is to change the dates.
 */
import { use, useState } from "react"
import { useSearchParams } from "next/navigation"
import { IndianRupee, LogIn, LogOut, Phone, Plus, Printer, Receipt as ReceiptIcon, UserX, XCircle } from "lucide-react"
import { api, API_BASE, ApiError, newClientUuid, QueuedOffline } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, formatDateTime, rupees, toPaise } from "@/lib/format"
import type { Booking, BookingState, Folio, Receipt } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Card, Chip, ChoiceChips, Disclosure, Empty, Field, KV, ListCard, ListRow, Loading, Menu, PageHeader, Sheet, type MenuItem, type Tone } from "@/components/ui"

const STATE_TONE: Record<BookingState, Tone> = { reserved: "warn", checked_in: "brand", checked_out: "neutral", no_show: "danger", cancelled: "neutral" }
const MODES = ["cash", "upi", "card", "bank"]

type Panel = "pay" | "extra" | "checkout" | "cancel" | "noShow" | null

export default function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const { can, user } = useSession()
  const search = useSearchParams()
  const justCheckedIn = search.get("checkedIn")

  const { data, error: loadError, reload } = useResource(
    async () => {
      const booking = await api<Booking>(`/api/bookings/${id}`)
      if (!booking.folioId) return { booking, folio: null, receipts: [] as Receipt[] }
      const [folio, receipts] = await Promise.all([
        api<Folio>(`/api/folios/${booking.folioId}`),
        api<Receipt[]>(`/api/folios/${booking.folioId}/receipts`),
      ])
      return { booking, folio, receipts }
    },
    [id],
    t("error.generic"),
  )
  const booking = data?.booking ?? null
  const folio = data?.folio ?? null
  const receipts = data?.receipts ?? []
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)

  const [payAmount, setPayAmount] = useState("")
  const [payMode, setPayMode] = useState("cash")
  const [extraText, setExtraText] = useState("")
  const [extraAmount, setExtraAmount] = useState("")
  const [approvalPin, setApprovalPin] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [cancelReason, setCancelReason] = useState("")

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      setPanel(null)
      reload()
    } catch (e) {
      if (e instanceof QueuedOffline) {
        window.dispatchEvent(new CustomEvent("pms:queued"))
        setError(t("error.offlineSaved"))
        setPanel(null)
      } else {
        setError(e instanceof ApiError ? e.message : t("error.generic"))
      }
    } finally {
      setBusy(false)
    }
  }

  const takePayment = () =>
    run(async () => {
      await api(`/api/folios/${booking!.folioId}/payments`, {
        method: "POST",
        clientUuid: newClientUuid(),
        queueWhenOffline: true,
        body: { mode: payMode, amountPaise: toPaise(payAmount), reference: "" },
      })
      setPayAmount("")
    })

  const addExtra = () =>
    run(async () => {
      await api(`/api/folios/${booking!.folioId}/lines`, {
        method: "POST",
        body: { line: { kind: "extra", description: extraText, qty: 1, unitPaise: toPaise(extraAmount), lineDate: null, reason: null } },
      })
      setExtraText("")
      setExtraAmount("")
    })

  const checkOut = () =>
    run(async () => {
      await api(`/api/bookings/${id}/check-out`, {
        method: "POST",
        body: {
          departAt: null,
          overrideReason: overrideReason || null,
          approverId: overrideReason ? user?.id : null,
          pin: overrideReason ? approvalPin : null,
        },
      })
      setOverrideReason("")
      setApprovalPin("")
    })

  const arrive = () => run(async () => { await api(`/api/bookings/${id}/arrive`, { method: "POST" }) })

  // Both release the rooms and need a manager: cancelling loses a sale, and a no-show decides what
  // happens to the advance according to the property's policy.
  const cancel = () =>
    run(async () => {
      await api(`/api/bookings/${id}/cancel`, { method: "POST", body: { reason: cancelReason, approverId: user?.id, pin: approvalPin } })
      setCancelReason("")
      setApprovalPin("")
    })

  const markNoShow = () =>
    run(async () => {
      await api(`/api/bookings/${id}/no-show`, { method: "POST", body: { approverId: user?.id, pin: approvalPin } })
      setApprovalPin("")
    })

  const issueInvoice = () =>
    run(async () => {
      const receipt = await api<Receipt>(`/api/folios/${booking!.folioId}/receipts/invoice`, { method: "POST" })
      window.open(`${API_BASE}/api/receipts/${receipt.id}/html`, "_blank")
    })

  if (loadError && !booking) return <Empty>{loadError}</Empty>
  if (!booking) return <Loading />

  const due = folio ? folio.totalPaise + folio.depositHeldPaise - folio.paidPaise : booking.balanceDuePaise
  const units = booking.units.map((u) => (u.bedLabel ? `${u.roomNumber}/${u.bedLabel}` : u.roomNumber)).join(", ") || "—"
  const state = booking.state as BookingState

  const menu: MenuItem[] = [
    ...(state === "checked_in" && folio ? [{ label: t("stay.addExtra"), icon: Plus, onSelect: () => setPanel("extra") }] : []),
    ...(state === "checked_out" && folio ? [{ label: t("stay.invoice"), icon: ReceiptIcon, onSelect: () => void issueInvoice() }] : []),
    ...(state === "reserved"
      ? [
          { label: t("action.markNoShow"), icon: UserX, onSelect: () => setPanel("noShow"), separator: true },
          { label: t("booking.cancel"), icon: XCircle, onSelect: () => setPanel("cancel"), danger: true },
        ]
      : []),
  ]

  const needsPin = !can("MANAGER")

  return (
    <div className="space-y-4">
      <PageHeader title={booking.guestName} back="/" actions={menu.length > 0 ? <Menu items={menu} /> : undefined}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Chip tone={STATE_TONE[state]} dot>{t(`state.${state}` as "state.reserved")}</Chip>
            {booking.guestPhone && <a href={`tel:${booking.guestPhone}`} className="inline-flex items-center gap-1 text-brand-ink"><Phone size={13} aria-hidden /> {booking.guestPhone}</a>}
          </span>
        }
      />

      {justCheckedIn && <Banner tone="ok">{t("checkin.elapsed", { seconds: justCheckedIn })}</Banner>}
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {/* Hero: the balance, coloured by whether it is owed. */}
      <Card className={due > 0 ? "border-danger/30" : "border-ok/30"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("stay.balance")}</p>
            <p className={`mt-1 text-[34px] font-bold leading-none tabular-nums tracking-tight ${due > 0 ? "text-danger" : "text-ok"}`}>{rupees(Math.max(0, due))}</p>
            {folio && <p className="mt-1.5 text-xs text-ink-soft">{t("stay.total")} {rupees(folio.totalPaise)} · {t("stay.paid")} {rupees(folio.paidPaise)}</p>}
          </div>
          <Avatar name={booking.guestName} tone={STATE_TONE[state]} size={48} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
          <div><dt className="text-xs text-ink-soft">{t("checkin.pickRoom")}</dt><dd className="font-semibold">{units}</dd></div>
          <div><dt className="text-xs text-ink-soft">{t("checkin.adults")}</dt><dd className="font-semibold">{booking.adults} + {booking.children}</dd></div>
          <div><dt className="text-xs text-ink-soft">{t("stay.title")}</dt><dd className="font-semibold">{formatDate(booking.arriveAt)} → {formatDate(booking.departAt)}</dd></div>
        </dl>
      </Card>

      {/* The two buttons the desk needs. */}
      {state === "reserved" && (
        <Button size="lg" className="w-full" disabled={busy} onClick={arrive}>
          <LogIn size={20} aria-hidden /> {t("action.arrive")}
        </Button>
      )}
      {state === "checked_in" && folio && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => { setPayAmount(due > 0 ? String(due / 100) : ""); setPanel("pay") }}>
            <IndianRupee size={20} aria-hidden /> {t("action.takePayment")}
          </Button>
          <Button size="lg" variant={due > 0 ? "secondary" : "primary"} disabled={busy} onClick={() => (due > 0 ? setPanel("checkout") : void checkOut())}>
            <LogOut size={20} aria-hidden /> {t("action.checkOut")}
          </Button>
        </div>
      )}
      {state === "checked_out" && folio && (
        <Button size="lg" className="w-full" disabled={busy} onClick={issueInvoice}>
          <ReceiptIcon size={20} aria-hidden /> {t("stay.invoice")}
        </Button>
      )}

      {folio && (
        <Disclosure title={t("stay.billDetails")} summary={t("stay.lines", { n: folio.lines.length })}>
          <ul className="divide-y divide-line text-sm">
            {folio.lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate">{line.description}</p>
                  <p className="text-xs text-ink-soft">
                    {formatDate(line.lineDate)}
                    {line.taxRateBp > 0 && ` · GST ${line.taxRateBp / 100}%`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{rupees(line.unitPaise * line.qty + line.cgstPaise + line.sgstPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 border-t border-line pt-2">
            <KV label={t("stay.total")} value={rupees(folio.totalPaise)} />
            {folio.depositHeldPaise !== 0 && <KV label={t("stay.deposit")} value={rupees(folio.depositHeldPaise)} />}
            <KV label={t("stay.paid")} value={rupees(folio.paidPaise)} />
            <KV label={t("stay.balance")} value={rupees(due)} strong tone={due > 0 ? "danger" : "ok"} />
          </dl>
        </Disclosure>
      )}

      {receipts.length > 0 && (
        <Disclosure title={t("stay.receipts")} summary={`${receipts.length}`}>
          <ListCard className="border-0 shadow-none">
            {receipts.map((r) => (
              <ListRow
                key={r.id}
                className="px-0"
                title={r.number}
                subtitle={`${r.kind} · ${formatDateTime(r.issuedAt)} · ${rupees(r.amountPaise)}`}
                right={
                  <a href={`${API_BASE}/api/receipts/${r.id}/html`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm"><Printer size={15} aria-hidden /> {t("action.print")}</Button>
                  </a>
                }
              />
            ))}
          </ListCard>
        </Disclosure>
      )}

      {/* --- sheets --- */}
      <Sheet open={panel === "pay"} onOpenChange={(o) => !o && setPanel(null)} title={t("action.takePayment")} description={`${t("stay.balance")} ${rupees(Math.max(0, due))}`}
        footer={<Button size="lg" className="w-full" disabled={busy || toPaise(payAmount) <= 0} onClick={takePayment}><IndianRupee size={18} aria-hidden /> {t("action.takePayment")}</Button>}>
        <div className="space-y-4">
          <Field label={t("stay.payment")}>
            <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0" autoFocus className="text-2xl font-bold" />
          </Field>
          <Field label={t("checkin.mode")}>
            <ChoiceChips value={payMode} onChange={setPayMode} options={MODES.map((m) => ({ value: m, label: m.toUpperCase() }))} />
          </Field>
        </div>
      </Sheet>

      <Sheet open={panel === "extra"} onOpenChange={(o) => !o && setPanel(null)} title={t("stay.addExtra")}
        footer={<Button size="lg" className="w-full" disabled={busy || !extraText || toPaise(extraAmount) <= 0} onClick={addExtra}>{t("action.add")}</Button>}>
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label={t("common.details")}><input value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="Thali" autoFocus /></Field>
          <Field label="₹"><input inputMode="decimal" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0" /></Field>
        </div>
      </Sheet>

      <Sheet open={panel === "checkout"} onOpenChange={(o) => !o && setPanel(null)} title={t("action.checkOut")} description={`${t("stay.balance")} ${rupees(due)}`}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => { setPanel(null); setPayAmount(String(due / 100)); setPanel("pay") }}>{t("action.takePayment")}</Button>
            {can("MANAGER") && <Button variant="danger" className="flex-1" disabled={busy || !overrideReason.trim() || !approvalPin} onClick={checkOut}>{t("action.checkOut")}</Button>}
          </>
        }>
        {can("MANAGER") ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{t("approval.title")}</p>
            <Field label={t("approval.reason")}><input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} autoFocus /></Field>
            <Field label={t("approval.pin")}><input inputMode="numeric" type="password" value={approvalPin} onChange={(e) => setApprovalPin(e.target.value)} /></Field>
          </div>
        ) : (
          <Banner tone="warn">{t("approval.title")}</Banner>
        )}
      </Sheet>

      <Sheet open={panel === "cancel" || panel === "noShow"} onOpenChange={(o) => !o && setPanel(null)}
        title={panel === "cancel" ? t("booking.cancel") : t("booking.noShowConfirm")}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)}>{t("action.back")}</Button>
            <Button variant="danger" className="flex-1" disabled={busy || (panel === "cancel" && !cancelReason.trim()) || (needsPin && !approvalPin)} onClick={panel === "cancel" ? cancel : markNoShow}>{t("action.done")}</Button>
          </>
        }>
        <div className="space-y-3">
          {panel === "cancel" && <Field label={t("booking.cancelReason")}><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus /></Field>}
          {needsPin && <Field label={t("approval.pin")}><input inputMode="numeric" type="password" value={approvalPin} onChange={(e) => setApprovalPin(e.target.value)} /></Field>}
        </div>
      </Sheet>
    </div>
  )
}
