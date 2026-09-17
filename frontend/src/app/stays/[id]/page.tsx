"use client"

/**
 * One stay: who is in which room, what they owe, and the two buttons the desk needs most, take payment and
 * check out. Charges the engine generated are shown but not editable here; the way to change them is to
 * change the dates, which keeps the bill and the stay in step.
 */
import { use, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IndianRupee, LogOut, Printer, Receipt as ReceiptIcon } from "lucide-react"
import { api, API_BASE, ApiError, newClientUuid, QueuedOffline } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, formatDateTime, rupees, toPaise } from "@/lib/format"
import type { Booking, Folio, Receipt } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Empty, Field, Loading } from "@/components/ui"

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

  const [payAmount, setPayAmount] = useState("")
  const [payMode, setPayMode] = useState("cash")
  const [extraText, setExtraText] = useState("")
  const [extraAmount, setExtraAmount] = useState("")
  const [approvalPin, setApprovalPin] = useState("")
  const [overrideReason, setOverrideReason] = useState("")

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      if (e instanceof QueuedOffline) {
        window.dispatchEvent(new CustomEvent("pms:queued"))
        setError(t("error.offlineSaved"))
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
        body: {
          line: { kind: "extra", description: extraText, qty: 1, unitPaise: toPaise(extraAmount), lineDate: null, reason: null },
        },
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

  const issueInvoice = () =>
    run(async () => {
      const receipt = await api<Receipt>(`/api/folios/${booking!.folioId}/receipts/invoice`, { method: "POST" })
      window.open(`${API_BASE}/api/receipts/${receipt.id}/html`, "_blank")
    })

  if (loadError && !booking) return <Empty>{loadError}</Empty>
  if (!booking) return <Loading />

  const due = folio ? folio.totalPaise + folio.depositHeldPaise - folio.paidPaise : booking.balanceDuePaise

  return (
    <div className="space-y-4">
      {justCheckedIn && <Banner tone="info">{t("checkin.elapsed", { seconds: justCheckedIn })}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{booking.guestName}</h1>
            <p className="text-sm text-[var(--color-ink-soft)]">{booking.guestPhone}</p>
          </div>
          <Chip tone={booking.state === "checked_in" ? "info" : booking.state === "checked_out" ? "neutral" : "warn"}>
            {booking.state.replace("_", " ")}
          </Chip>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-[var(--color-ink-soft)]">{t("checkin.pickRoom")}</dt>
            <dd className="font-semibold">
              {booking.units.map((u) => (u.bedLabel ? `${u.roomNumber}/${u.bedLabel}` : u.roomNumber)).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-soft)]">{t("checkin.adults")}</dt>
            <dd className="font-semibold">
              {booking.adults} + {booking.children}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-ink-soft)]">{t("stay.title")}</dt>
            <dd className="font-semibold">
              {formatDate(booking.arriveAt)} → {formatDate(booking.departAt)}
            </dd>
          </div>
        </dl>
      </Card>

      {folio && (
        <Card>
          <h2 className="mb-2 font-semibold">{t("stay.folio")}</h2>
          <ul className="divide-y divide-[var(--color-line)] text-sm">
            {folio.lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate">{line.description}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {formatDate(line.lineDate)}
                    {line.taxRateBp > 0 && ` · GST ${line.taxRateBp / 100}%`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{rupees(line.unitPaise * line.qty + line.cgstPaise + line.sgstPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-[var(--color-line)] pt-3 text-sm">
            <Row label={t("stay.total")} value={rupees(folio.totalPaise)} />
            {folio.depositHeldPaise !== 0 && <Row label={t("stay.deposit")} value={rupees(folio.depositHeldPaise)} />}
            <Row label={t("stay.paid")} value={rupees(folio.paidPaise)} />
            <Row label={t("stay.balance")} value={rupees(due)} strong tone={due > 0 ? "danger" : "ok"} />
          </dl>
        </Card>
      )}

      {booking.state === "reserved" && (
        <Button className="w-full" disabled={busy} onClick={arrive}>
          {t("action.arrive")}
        </Button>
      )}

      {booking.state === "checked_in" && folio && (
        <>
          <Card className="space-y-2">
            <h2 className="font-semibold">{t("action.takePayment")}</h2>
            <div className="flex gap-2">
              <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={String(Math.max(0, due) / 100)} />
              <select className="w-32" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                <option value="cash">cash</option>
                <option value="upi">upi</option>
                <option value="card">card</option>
                <option value="bank">bank</option>
              </select>
            </div>
            <Button className="w-full" disabled={busy || toPaise(payAmount) <= 0} onClick={takePayment}>
              <IndianRupee size={18} aria-hidden /> {t("action.takePayment")}
            </Button>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-semibold">{t("stay.addExtra")}</h2>
            <div className="flex gap-2">
              <input value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="Thali" />
              <input className="w-32" inputMode="decimal" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0" />
            </div>
            <Button variant="secondary" className="w-full" disabled={busy || !extraText || toPaise(extraAmount) <= 0} onClick={addExtra}>
              {t("action.add")}
            </Button>
          </Card>

          {due > 0 && can("MANAGER") && (
            <Card className="space-y-2">
              <h2 className="font-semibold">{t("approval.title")}</h2>
              <Field label={t("approval.reason")}>
                <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </Field>
              <Field label={t("approval.pin")}>
                <input inputMode="numeric" type="password" value={approvalPin} onChange={(e) => setApprovalPin(e.target.value)} />
              </Field>
            </Card>
          )}

          <Button variant={due > 0 ? "secondary" : "primary"} className="w-full py-4" disabled={busy} onClick={checkOut}>
            <LogOut size={18} aria-hidden /> {t("action.checkOut")}
          </Button>
        </>
      )}

      {booking.state === "checked_out" && folio && (
        <Button className="w-full" disabled={busy} onClick={issueInvoice}>
          <ReceiptIcon size={18} aria-hidden /> {t("stay.invoice")}
        </Button>
      )}

      {receipts.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">{t("stay.receipts")}</h2>
          <ul className="space-y-2 text-sm">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{receipt.number}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {receipt.kind} · {formatDateTime(receipt.issuedAt)} · {rupees(receipt.amountPaise)}
                  </p>
                </div>
                <a href={`${API_BASE}/api/receipts/${receipt.id}/html`} target="_blank" rel="noreferrer">
                  <Button variant="secondary">
                    <Printer size={16} aria-hidden /> {t("action.print")}
                  </Button>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/" className="block">
        <Button variant="ghost" className="w-full">
          {t("action.back")}
        </Button>
      </Link>
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "danger" }) {
  const color = tone === "danger" ? "text-[var(--color-danger)]" : tone === "ok" ? "text-[var(--color-ok)]" : ""
  return (
    <div className="flex justify-between">
      <dt className={strong ? "font-semibold" : "text-[var(--color-ink-soft)]"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : ""} ${color}`}>{value}</dd>
    </div>
  )
}
