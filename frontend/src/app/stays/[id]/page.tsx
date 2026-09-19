"use client"

/**
 * One reservation. A header with who, the reference and the state; a strip with every fact the desk asks
 * about; then tabs — rooms, bill, guest, receipts, and the audit trail of who did what. The two actions the
 * desk needs most (arrive, or take payment and check out) sit in the header; everything else waits in the
 * menu. Charges the engine generated are shown but not editable; the way to change them is to change dates.
 *
 * A group is the same screen with more rooms: beds can be added, changed or given back one by one, and the
 * party's names are allocated to them for the register.
 */
import { use, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as Tabs from "@radix-ui/react-tabs"
import { ArrowLeft, BedDouble, CheckCircle2, FilePen, IndianRupee, LogIn, LogOut, Minus, Percent, Phone, Plus, Printer, Receipt as ReceiptIcon, Undo2, UserRound, Users, UserX, XCircle } from "lucide-react"
import { clsx } from "clsx"
import { api, API_BASE, ApiError, newClientUuid, QueuedOffline } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, formatDateTime, formatTime, rupees, toPaise, unitName } from "@/lib/format"
import { CHARGE_CATEGORIES, type Booking, type BookingState, type Folio, type FreeUnit, type Guest, type Member, type Receipt } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Chip, ChoiceChips, Empty, Field, KV, Loading, Menu, Sheet, type MenuItem, type Tone } from "@/components/ui"

const STATE_TONE: Record<BookingState, Tone> = { pending: "warn", reserved: "brand", checked_in: "ok", checked_out: "neutral", no_show: "danger", cancelled: "neutral" }
const PAYMENT_TONE: Record<Booking["paymentStatus"], Tone> = { unpaid: "danger", partial: "warn", paid: "ok" }
const MODES = ["cash", "upi", "card", "bank"]
const DAY = 86_400_000
const LIVE: BookingState[] = ["pending", "reserved", "checked_in"]

type Panel = "pay" | "extra" | "checkout" | "cancel" | "noShow" | "details" | "party" | "addUnit" | "changeUnit" | "release" | "discount" | "refund" | "creditNote" | null
type Activity = { at: string; table: string; action: string; userName: string | null }

/** A stay already under way can only take a room from now on. */
const notBeforeNow = (iso: string) => new Date(Math.max(Date.now(), Date.parse(iso)))

/** A translation when the language files have one, else the words of the key. */
function useLabel() {
  const { t } = useI18n()
  return (key: string, fallback: string) => {
    const text = t(key as Parameters<typeof t>[0])
    return text === key ? fallback : text
  }
}

export default function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const label = useLabel()
  const router = useRouter()
  const { can, has, user } = useSession()
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
  const [extraQty, setExtraQty] = useState(1)
  const [extraCategory, setExtraCategory] = useState<string>("food")
  const [approvalPin, setApprovalPin] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [details, setDetails] = useState({ specialRequests: "", notes: "", groupName: "", organization: "", billingGstin: "" })
  const [party, setParty] = useState<Member[]>([])
  const [free, setFree] = useState<FreeUnit[] | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [freeKey, setFreeKey] = useState("")
  const [noteFor, setNoteFor] = useState<Receipt | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      setPanel(null)
      setApprovalPin("")
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
        body: { line: { kind: "extra", description: extraText, qty: extraQty, unitPaise: toPaise(extraAmount), lineDate: null, reason: null, category: extraCategory } },
      })
      setExtraText("")
      setExtraAmount("")
      setExtraQty(1)
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
    })

  const arrive = () => run(async () => { await api(`/api/bookings/${id}/arrive`, { method: "POST" }) })
  const confirm = () => run(async () => { await api(`/api/bookings/${id}/confirm`, { method: "POST" }) })

  // Both release the rooms and need a manager: cancelling loses a sale, and a no-show decides what
  // happens to the advance according to the property's policy.
  const cancel = () =>
    run(async () => {
      await api(`/api/bookings/${id}/cancel`, { method: "POST", body: { reason: cancelReason, approverId: user?.id, pin: approvalPin } })
      setCancelReason("")
    })

  const markNoShow = () =>
    run(async () => {
      await api(`/api/bookings/${id}/no-show`, { method: "POST", body: { approverId: user?.id, pin: approvalPin } })
    })

  const issueInvoice = () =>
    run(async () => {
      const receipt = await api<Receipt>(`/api/folios/${booking!.folioId}/receipts/invoice`, { method: "POST" })
      window.open(`${API_BASE}/api/receipts/${receipt.id}/html`, "_blank")
    })

  /** A receipt for money just received: not a tax invoice, which comes at checkout. */
  const paymentReceipt = (paise: number) =>
    run(async () => {
      const receipt = await api<Receipt>(`/api/folios/${booking!.folioId}/receipts/provisional?amountPaise=${paise}`, { method: "POST" })
      window.open(`${API_BASE}/api/receipts/${receipt.id}/html`, "_blank")
    })

  const giveDiscount = () =>
    run(async () => {
      await api(`/api/folios/${booking!.folioId}/lines`, {
        method: "POST",
        body: { line: { kind: "discount", description: reason, qty: 1, unitPaise: -toPaise(amount), lineDate: null, reason }, approverId: user?.id, pin: approvalPin },
      })
      setAmount(""); setReason("")
    })

  const refund = () =>
    run(async () => {
      await api(`/api/folios/${booking!.folioId}/refunds`, {
        method: "POST",
        body: { payment: { mode: payMode, amountPaise: toPaise(amount), reference: "", receivedAt: null, reason, clientUuid: newClientUuid() }, approverId: user?.id, pin: approvalPin },
      })
      setAmount(""); setReason("")
    })

  const creditNote = () =>
    run(async () => {
      const note = await api<Receipt>(`/api/folios/receipts/${noteFor!.id}/credit-note`, {
        method: "POST", body: { amountPaise: toPaise(amount), reason, approverId: user?.id, pin: approvalPin },
      })
      setAmount(""); setReason(""); setNoteFor(null)
      window.open(`${API_BASE}/api/receipts/${note.id}/html`, "_blank")
    })

  const saveDetails = () =>
    run(async () => {
      await api(`/api/bookings/${id}`, {
        method: "PATCH",
        body: { details: { specialRequests: details.specialRequests, groupName: details.groupName, organization: details.organization, billingGstin: details.billingGstin }, notes: details.notes },
      })
    })

  const saveParty = () =>
    run(async () => { await api(`/api/bookings/${id}/members`, { method: "PUT", body: party.filter((m) => m.name.trim()) }) })

  /** Free rooms and beds for the rest of this stay, fetched when a sheet that needs them opens. */
  async function openFree(next: Panel, forUnit: string | null) {
    if (!booking) return
    setPanel(next)
    setUnitId(forUnit)
    setFreeKey("")
    setFree(null)
    const unit = booking.units.find((u) => u.id === forUnit)
    const from = notBeforeNow(unit?.arriveAt ?? booking.arriveAt)
    const to = unit?.departAt ?? booking.departAt
    try {
      setFree(await api<FreeUnit[]>(`/api/bookings/availability?arrive=${encodeURIComponent(from.toISOString())}&depart=${encodeURIComponent(to)}`))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
      setPanel(null)
    }
  }

  const takeUnit = () =>
    run(async () => {
      const [roomId, bedId] = freeKey.split(":")
      const target = { roomId, bedId: bedId || null, ratePaise: null }
      if (panel === "changeUnit") await api(`/api/bookings/${id}/units/${unitId}`, { method: "PATCH", body: { target } })
      else await api(`/api/bookings/${id}/units`, { method: "POST", body: target })
    })

  const releaseUnit = () =>
    run(async () => { await api(`/api/bookings/${id}/units/${unitId}/release`, { method: "POST", body: { approverId: user?.id, pin: approvalPin } }) })

  if (loadError && !booking) return <Empty>{loadError}</Empty>
  if (!booking) return <Loading />

  const due = folio ? folio.totalPaise + folio.depositHeldPaise - folio.paidPaise : booking.balanceDuePaise
  const units = booking.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ") || "—"
  const state = booking.state as BookingState
  const live = LIVE.includes(state)
  const nights = Math.max(1, Math.round((Date.parse(booking.departAt) - Date.parse(booking.arriveAt)) / DAY))
  const edit = has("reservations.edit")
  const pin = (permission: string) => !has(permission)
  const released = (u: Booking["units"][number]) => state !== "reserved" && state !== "pending" && Date.parse(u.departAt) < Date.parse(booking.departAt)

  const menu: MenuItem[] = [
    ...(state === "checked_in" && folio ? [{ label: t("stay.addExtra"), icon: Plus, onSelect: () => setPanel("extra") }] : []),
    ...(live && folio ? [{ label: t("stay.giveDiscount"), icon: Percent, onSelect: () => { setAmount(""); setReason(""); setPanel("discount") } }] : []),
    ...(folio && folio.paidPaise > 0 && (has("refund") || has("checkout")) ? [{ label: t("stay.refund"), icon: Undo2, onSelect: () => { setAmount(""); setReason(""); setPanel("refund") } }] : []),
    ...(state === "checked_out" && folio ? [{ label: t("stay.invoice"), icon: ReceiptIcon, onSelect: () => void issueInvoice() }] : []),
    ...(live && edit
      ? [
          { label: t("stay.editDetails"), icon: FilePen, separator: true, onSelect: () => {
            setDetails({ specialRequests: booking.specialRequests ?? "", notes: booking.notes ?? "", groupName: booking.groupName ?? "", organization: booking.organization ?? "", billingGstin: booking.billingGstin ?? "" })
            setPanel("details")
          } },
          { label: t("stay.party"), icon: Users, onSelect: () => { setParty(booking.members.length ? booking.members : [{ id: null, name: booking.guestName, adult: true, idType: null, idLast4: null, unitId: null }]); setPanel("party") } },
          { label: t("stay.addUnit"), icon: BedDouble, onSelect: () => void openFree("addUnit", null) },
        ]
      : []),
    ...(state === "reserved" || state === "pending"
      ? [
          { label: t("action.markNoShow"), icon: UserX, onSelect: () => setPanel("noShow"), separator: true },
          { label: t("booking.cancel"), icon: XCircle, onSelect: () => setPanel("cancel"), danger: true },
        ]
      : []),
  ]

  const facts: { label: string; value: React.ReactNode; sub?: string; tone?: string }[] = [
    { label: t("action.checkIn"), value: formatDate(booking.arriveAt), sub: formatTime(booking.arriveAt) },
    { label: t("action.checkOut"), value: formatDate(booking.departAt), sub: formatTime(booking.departAt) },
    { label: t("res.nights"), value: nights },
    { label: t("res.bookedOn"), value: formatDate(booking.createdAt), sub: formatTime(booking.createdAt) },
    { label: t("res.guests"), value: `${booking.adults} + ${booking.children}` },
    { label: t("res.source"), value: label(`source.${booking.source}`, booking.source), sub: booking.organization ?? undefined },
    { label: t("dash.col.room"), value: units },
    { label: t("stay.balance"), value: rupees(Math.max(0, due)), sub: t(`payment.${booking.paymentStatus}` as "payment.paid"), tone: due > 0 ? "text-danger" : "text-ok" },
  ]

  const freeByType = new Map<string, FreeUnit[]>()
  for (const f of free ?? []) freeByType.set(f.typeName, [...(freeByType.get(f.typeName) ?? []), f])
  const unitLabel = (unit: string | null) => {
    const u = booking.units.find((x) => x.id === unit)
    return u ? unitName(u.roomNumber, u.bedLabel) : t("stay.notAllocated")
  }

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> {t("action.back")}
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight">{booking.groupName || booking.guestName}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="font-mono font-semibold tracking-wider" title={t("res.reference")}>{booking.id.slice(0, 8).toUpperCase()}</span>
            <Chip tone={STATE_TONE[state]} dot>{t(`state.${state}` as "state.reserved")}</Chip>
            <Chip tone={PAYMENT_TONE[booking.paymentStatus]}>{t(`payment.${booking.paymentStatus}` as "payment.paid")}</Chip>
            {booking.groupName && <span className="inline-flex items-center gap-1 font-medium"><UserRound size={13} aria-hidden /> {booking.guestName}</span>}
            {booking.guestPhone && <a href={`tel:${booking.guestPhone}`} className="inline-flex items-center gap-1 font-medium text-brand-ink"><Phone size={13} aria-hidden /> {booking.guestPhone}</a>}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {state === "pending" && edit && (
            <Button size="lg" variant="secondary" className="flex-1 sm:flex-none" disabled={busy} onClick={confirm}><CheckCircle2 size={20} aria-hidden /> {t("stay.confirm")}</Button>
          )}
          {(state === "reserved" || state === "pending") && (
            <Button size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={arrive}><LogIn size={20} aria-hidden /> {t("action.arrive")}</Button>
          )}
          {state === "checked_in" && folio && (
            <>
              <Button size="lg" className="flex-1 sm:flex-none" onClick={() => { setPayAmount(due > 0 ? String(due / 100) : ""); setPanel("pay") }}>
                <IndianRupee size={20} aria-hidden /> {t("action.takePayment")}
              </Button>
              <Button size="lg" className="flex-1 sm:flex-none" variant={due > 0 ? "secondary" : "primary"} disabled={busy} onClick={() => (due > 0 ? setPanel("checkout") : void checkOut())}>
                <LogOut size={20} aria-hidden /> {t("action.checkOut")}
              </Button>
            </>
          )}
          {state === "checked_out" && folio && (
            <Button size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={issueInvoice}><ReceiptIcon size={20} aria-hidden /> {t("stay.invoice")}</Button>
          )}
          {menu.length > 0 && <Menu items={menu} />}
        </div>
      </header>

      {justCheckedIn && <Banner tone="ok">{t("checkin.elapsed", { seconds: justCheckedIn })}</Banner>}
      {state === "pending" && booking.holdUntil && <Banner tone="warn">{t("stay.holdUntil", { time: formatDateTime(booking.holdUntil) })}</Banner>}
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {/* Every fact the desk is asked about, in one strip. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-[var(--shadow-card)] sm:grid-cols-4 xl:grid-cols-8">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0 bg-surface px-4 py-3">
            <dt className="text-xs font-semibold text-ink-soft">{f.label}</dt>
            <dd className={clsx("mt-0.5 truncate font-bold tabular-nums", f.tone)}>{f.value}</dd>
            {f.sub && <dd className="truncate text-xs text-ink-faint">{f.sub}</dd>}
          </div>
        ))}
      </dl>

      <Tabs.Root defaultValue="stay" className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <Tabs.List className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-2">
          {([
            ["stay", t("res.tab.stay")],
            ["bill", t("res.tab.bill")],
            ["guest", t("res.tab.guest")],
            ["receipts", `${t("res.tab.receipts")}${receipts.length ? ` (${receipts.length})` : ""}`],
            ["activity", t("res.tab.activity")],
          ] as const).map(([value, text]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="relative shrink-0 whitespace-nowrap px-3 text-sm font-semibold text-ink-soft transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-ink data-[state=active]:text-ink data-[state=active]:after:bg-brand"
            >
              {text}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="stay" className="p-4 outline-none md:p-5">
          <Table
            head={[t("res.col.room"), t("res.col.dates"), t("res.nights"), t("res.col.rate"), ...(live && edit ? [""] : [])]}
            rows={booking.units.map((u) => [
              <b key="r" className="tabular-nums">{unitName(u.roomNumber, u.bedLabel)}</b>,
              <span key="d">{formatDate(u.arriveAt)} → {formatDate(u.departAt)}{released(u) && <Chip tone="neutral" className="ml-2">{t("stay.released")}</Chip>}</span>,
              Math.max(1, Math.round((Date.parse(u.departAt) - Date.parse(u.arriveAt)) / DAY)),
              rupees(u.ratePaise),
              ...(live && edit
                ? [
                    <span key="a" className="flex justify-end gap-1.5">
                      {!released(u) && <Button variant="secondary" size="sm" onClick={() => void openFree("changeUnit", u.id)}>{t("stay.changeUnit")}</Button>}
                      {booking.units.length > 1 && !released(u) && (
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => { setUnitId(u.id); setPanel("release") }}>{t("stay.releaseUnit")}</Button>
                      )}
                    </span>,
                  ]
                : []),
            ])}
          />
          {booking.members.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">{t("checkin.members")}</h3>
              <ul className="flex flex-wrap gap-2">
                {booking.members.map((m) => <li key={m.id ?? m.name}><Chip tone="neutral">{m.name}{m.unitId && ` · ${unitLabel(m.unitId)}`}</Chip></li>)}
              </ul>
            </div>
          )}
          {booking.specialRequests && <p className="mt-4 text-sm"><b>{t("booking.specialRequests")}:</b> {booking.specialRequests}</p>}
          {booking.notes && <p className="mt-4 text-sm text-ink-soft">{booking.notes}</p>}
        </Tabs.Content>

        <Tabs.Content value="bill" className="p-4 outline-none md:p-5">
          {!folio ? <Empty /> : (
            <>
              <Table
                head={[t("common.details"), t("res.col.dates"), "GST", t("stay.total")]}
                rows={folio.lines.map((line) => [
                  <span key="d">{line.description}{line.category && line.category !== "room" && <Chip tone="neutral" className="ml-2">{label(`category.${line.category}`, line.category)}</Chip>}</span>,
                  formatDate(line.lineDate),
                  line.taxRateBp > 0 ? `${line.taxRateBp / 100}%${line.igstPaise ? " IGST" : ""}` : "—",
                  <span key="a" className="tabular-nums">{rupees(line.unitPaise * line.qty + line.cgstPaise + line.sgstPaise + (line.igstPaise ?? 0))}</span>,
                ])}
              />
              <dl className="ml-auto mt-4 max-w-xs">
                <KV label={t("stay.total")} value={rupees(folio.totalPaise)} />
                {folio.depositHeldPaise !== 0 && <KV label={t("stay.deposit")} value={rupees(folio.depositHeldPaise)} />}
                <KV label={t("stay.paid")} value={rupees(folio.paidPaise)} />
                <KV label={t("stay.balance")} value={rupees(due)} strong tone={due > 0 ? "danger" : "ok"} />
              </dl>
              {folio.payments.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold text-ink-soft">{t("stay.payments")}</h3>
                  <Table
                    head={[t("res.col.dates"), t("checkin.mode"), t("stay.total"), ""]}
                    rows={folio.payments.map((p) => [
                      formatDateTime(p.receivedAt),
                      <span key="m">{label(`option.${p.mode}`, p.mode.toUpperCase())}{p.refund && <Chip tone="warn" className="ml-2">{t("stay.refund")}</Chip>}{p.reference && <span className="ml-1 text-xs text-ink-soft">{p.reference}</span>}</span>,
                      <span key="a" className="tabular-nums">{rupees(p.amountPaise)}</span>,
                      !p.refund ? <Button key="r" variant="secondary" size="sm" disabled={busy} onClick={() => paymentReceipt(p.amountPaise)}><Printer size={15} aria-hidden /> {t("stay.receipt")}</Button> : "",
                    ])}
                  />
                </div>
              )}
            </>
          )}
        </Tabs.Content>

        <Tabs.Content value="guest" className="p-4 outline-none md:p-5">
          <GuestPanel guestId={booking.guestId} />
          {booking.organization && (
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="border-b border-line pb-2"><dt className="text-xs font-semibold text-ink-soft">{t("stay.company")}</dt><dd className="font-medium">{booking.organization}</dd></div>
              {booking.billingGstin && <div className="border-b border-line pb-2"><dt className="text-xs font-semibold text-ink-soft">GSTIN</dt><dd className="font-medium">{booking.billingGstin}</dd></div>}
            </dl>
          )}
          <Link href={`/guests/${booking.guestId}`} className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline">
            <UserRound size={16} aria-hidden /> {t("stay.guestProfile")}
          </Link>
        </Tabs.Content>

        <Tabs.Content value="receipts" className="p-4 outline-none md:p-5">
          {receipts.length === 0 ? <Empty /> : (
            <Table
              head={[t("res.reference"), t("dash.col.status"), t("res.col.dates"), t("stay.total"), ""]}
              rows={receipts.map((r) => [
                <b key="n">{r.number}</b>,
                label(`option.${r.kind}`, r.kind),
                formatDateTime(r.issuedAt),
                rupees(r.amountPaise),
                <span key="p" className="flex justify-end gap-1.5">
                  {(r.kind === "invoice" || r.kind === "donation") && (has("invoice.edit") || has("checkout")) && (
                    <Button variant="ghost" size="sm" onClick={() => { setNoteFor(r); setAmount(""); setReason(""); setPanel("creditNote") }}><Minus size={15} aria-hidden /> {t("stay.creditNote")}</Button>
                  )}
                  <a href={`${API_BASE}/api/receipts/${r.id}/html`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm"><Printer size={15} aria-hidden /> {t("action.print")}</Button>
                  </a>
                </span>,
              ])}
            />
          )}
        </Tabs.Content>

        <Tabs.Content value="activity" className="p-4 outline-none md:p-5">
          <ActivityPanel bookingId={booking.id} />
        </Tabs.Content>
      </Tabs.Root>

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
        <div className="space-y-3">
          <Field label={t("stay.category")}>
            <ChoiceChips value={extraCategory} onChange={setExtraCategory} options={CHARGE_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))} />
          </Field>
          <div className="grid grid-cols-[1fr_72px_110px] gap-2">
            <Field label={t("common.details")}><input value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="Thali" autoFocus /></Field>
            <Field label={t("stay.qty")}><input type="number" min={1} value={extraQty} onChange={(e) => setExtraQty(Math.max(1, Number(e.target.value) || 1))} /></Field>
            <Field label="₹"><input inputMode="decimal" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0" /></Field>
          </div>
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
            <Button variant="danger" className="flex-1" disabled={busy || (panel === "cancel" && !cancelReason.trim()) || (pin("reservations.cancel") && !approvalPin)} onClick={panel === "cancel" ? cancel : markNoShow}>{t("action.done")}</Button>
          </>
        }>
        <div className="space-y-3">
          {panel === "cancel" && <Field label={t("booking.cancelReason")}><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus /></Field>}
          {pin("reservations.cancel") && <PinField value={approvalPin} onChange={setApprovalPin} />}
        </div>
      </Sheet>

      {/* A reduction, a refund or a credit note: an amount, a reason, and a PIN unless the role may do it alone. */}
      <Sheet open={panel === "discount" || panel === "refund" || panel === "creditNote"} onOpenChange={(o) => !o && setPanel(null)}
        title={panel === "discount" ? t("stay.giveDiscount") : panel === "refund" ? t("stay.refund") : `${t("stay.creditNote")} · ${noteFor?.number ?? ""}`}
        description={panel === "refund" && folio ? t("stay.refundHint", { amount: rupees(folio.paidPaise) }) : panel === "creditNote" && noteFor ? rupees(noteFor.amountPaise) : undefined}
        footer={
          <Button size="lg" className="w-full"
            disabled={busy || toPaise(amount) <= 0 || !reason.trim() || (pin(panel === "discount" ? "discount.apply" : panel === "refund" ? "refund" : "invoice.edit") && !approvalPin)}
            onClick={panel === "discount" ? giveDiscount : panel === "refund" ? refund : creditNote}>
            {t("action.done")}
          </Button>
        }>
        <div className="space-y-3">
          <Field label="₹"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus className="text-2xl font-bold" /></Field>
          {panel === "refund" && (
            <Field label={t("checkin.mode")}><ChoiceChips value={payMode} onChange={setPayMode} options={MODES.map((m) => ({ value: m, label: m.toUpperCase() }))} /></Field>
          )}
          <Field label={t("common.reason")}><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {pin(panel === "discount" ? "discount.apply" : panel === "refund" ? "refund" : "invoice.edit") && <PinField value={approvalPin} onChange={setApprovalPin} />}
        </div>
      </Sheet>

      <Sheet open={panel === "details"} onOpenChange={(o) => !o && setPanel(null)} title={t("stay.editDetails")}
        footer={<Button size="lg" className="w-full" disabled={busy} onClick={saveDetails}>{t("action.save")}</Button>}>
        <div className="space-y-3">
          <Field label={t("booking.groupName")}><input value={details.groupName} onChange={(e) => setDetails({ ...details, groupName: e.target.value })} /></Field>
          <Field label={t("booking.organization")}><input value={details.organization} onChange={(e) => setDetails({ ...details, organization: e.target.value })} /></Field>
          <Field label={t("booking.billingGstin")}><input value={details.billingGstin} maxLength={15} onChange={(e) => setDetails({ ...details, billingGstin: e.target.value.toUpperCase() })} /></Field>
          <Field label={t("booking.specialRequests")}><textarea rows={2} value={details.specialRequests} onChange={(e) => setDetails({ ...details, specialRequests: e.target.value })} /></Field>
          <Field label={t("booking.notes")}><textarea rows={2} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} /></Field>
        </div>
      </Sheet>

      <Sheet wide open={panel === "party"} onOpenChange={(o) => !o && setPanel(null)} title={t("stay.party")} description={units}
        footer={<Button size="lg" className="w-full" disabled={busy} onClick={saveParty}>{t("action.save")}</Button>}>
        <div className="space-y-2">
          {party.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
              <input value={m.name} placeholder={t("checkin.name")} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" aria-label={t("action.remove")} onClick={() => setParty(party.filter((_, j) => j !== i))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2 sm:order-last"><XCircle size={18} aria-hidden /></button>
              <select value={m.unitId ?? ""} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, unitId: e.target.value || null } : x)))}>
                <option value="">{t("stay.notAllocated")}</option>
                {booking.units.filter((u) => !released(u)).map((u) => <option key={u.id} value={u.id}>{unitName(u.roomNumber, u.bedLabel)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!m.adult} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, adult: !e.target.checked } : x)))} />
                <span>{t("stay.child")}</span>
              </label>
            </div>
          ))}
          <Button variant="secondary" className="w-full" onClick={() => setParty([...party, { id: null, name: "", adult: true, idType: null, idLast4: null, unitId: null }])}>
            <Plus size={16} aria-hidden /> {t("stay.addMember")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={panel === "addUnit" || panel === "changeUnit"} onOpenChange={(o) => !o && setPanel(null)}
        title={panel === "addUnit" ? t("stay.addUnit") : `${t("stay.changeRoom")} · ${unitLabel(unitId)}`} description={t("stay.pickUnit")}
        footer={<Button size="lg" className="w-full" disabled={busy || !freeKey} onClick={takeUnit}>{t("action.done")}</Button>}>
        {free === null ? <Loading rows={1} /> : free.length === 0 ? <Empty>{t("stay.noneFree")}</Empty> : (
          <div className="space-y-3">
            {[...freeByType.entries()].map(([type, list]) => (
              <Field key={type} label={`${type} · ${rupees(list[0].ratePaise)}`}>
                <div className="flex flex-wrap gap-2">
                  {list.map((f) => {
                    const key = `${f.roomId}:${f.bedId ?? ""}`
                    return (
                      <button key={key} type="button" aria-pressed={freeKey === key} onClick={() => setFreeKey(key)}
                        className={clsx("min-h-[44px] min-w-[64px] rounded-xl border px-3 text-[15px] font-bold tabular-nums transition-colors", freeKey === key ? "border-brand bg-brand text-on-solid" : "border-line-strong bg-surface hover:bg-surface-2")}>
                        {unitName(f.roomNumber, f.bedLabel)}
                      </button>
                    )
                  })}
                </div>
              </Field>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={panel === "release"} onOpenChange={(o) => !o && setPanel(null)} title={`${t("stay.releaseUnit")} · ${unitLabel(unitId)}`}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)}>{t("action.back")}</Button>
            <Button variant="danger" className="flex-1" disabled={busy || (pin("discount.apply") && !approvalPin)} onClick={releaseUnit}>{t("stay.releaseUnit")}</Button>
          </>
        }>
        {pin("discount.apply") ? <PinField value={approvalPin} onChange={setApprovalPin} /> : <p className="text-sm text-ink-soft">{unitLabel(unitId)}</p>}
      </Sheet>
    </div>
  )
}

function PinField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return <Field label={t("approval.pin")}><input inputMode="numeric" type="password" value={value} onChange={(e) => onChange(e.target.value)} /></Field>
}

/** A plain table that scrolls sideways on a phone rather than squeezing its columns. */
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <Empty />
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <tr>{head.map((h, i) => <th key={i} className={clsx("px-4 py-2.5 font-semibold", i === head.length - 1 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((cells, r) => (
            <tr key={r}>{cells.map((c, i) => <td key={i} className={clsx("px-4 py-3", i === cells.length - 1 && "text-right")}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The guest record, fetched when its tab is opened. */
function GuestPanel({ guestId }: { guestId: string }) {
  const { t } = useI18n()
  const { data: guest, error } = useResource(() => api<Guest>(`/api/guests/${guestId}`), [guestId], t("error.generic"))
  if (error) return <Banner tone="danger">{error}</Banner>
  if (!guest) return <Loading rows={1} />
  const rows: [string, string | null][] = [
    [t("checkin.name"), guest.name],
    [t("login.phone"), guest.phone],
    [t("checkin.city"), guest.city],
    [t("checkin.address"), guest.address],
    [t("checkin.nationality"), guest.nationality],
    [t("checkin.idType"), guest.idType],
    [t("checkin.idLast4"), guest.idLast4 ? `•••• ${guest.idLast4}` : null],
  ]
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="border-b border-line pb-2">
          <dt className="text-xs font-semibold text-ink-soft">{k}</dt>
          <dd className="font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Who did what to this stay, newest first, from the audit log. */
function ActivityPanel({ bookingId }: { bookingId: string }) {
  const { t } = useI18n()
  const label = useLabel()
  const { data, error } = useResource(() => api<Activity[]>(`/api/bookings/${bookingId}/activity`), [bookingId], t("error.generic"))
  if (error) return <Banner tone="danger">{error}</Banner>
  if (!data) return <Loading rows={2} />
  if (data.length === 0) return <Empty>{t("res.noActivity")}</Empty>
  return (
    <ol className="space-y-4 border-l-2 border-line pl-5">
      {data.map((a, i) => (
        <li key={i} className="relative">
          <span aria-hidden className={clsx("absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-surface", i === 0 ? "bg-brand" : "bg-line-strong")} />
          <p className="font-semibold">{label(`activity.${a.table}.${a.action}`, a.action.replace(/_/g, " "))}</p>
          <p className="text-xs text-ink-soft">{formatDateTime(a.at)} · {t("res.by", { name: a.userName ?? t("res.system") })}</p>
        </li>
      ))}
    </ol>
  )
}
