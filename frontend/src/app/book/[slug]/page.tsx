"use client"

/**
 * The property's own booking page: a guest picks dates, sees which room types are free and what they cost,
 * and books. No account, nothing stored on the phone.
 *
 * Three steps on one screen — dates, room, details — then a reference to show at the desk. The server
 * re-checks everything this page checks; the checks here only save the guest a round trip.
 *
 * When the property takes payment online, the booking holds the room while the guest pays in the gateway's own
 * window, and is confirmed only when the server has verified the payment with the gateway. A failed or closed
 * payment can be tried again while the hold lasts.
 */
import { use, useEffect, useMemo, useState } from "react"
import { ArrowLeft, BedDouble, CalendarDays, Check, Clock, CreditCard, MapPin, Phone, Users } from "lucide-react"
import {
  bookOnline, getBookingPage, getOffers, PublicApiError, reportPaymentFailure, retryPayment, simulatePayment, verifyPayment,
  type BookingPage, type Checkout, type Confirmation, type Offer,
} from "@/lib/public-api"
import { openRazorpay, type CheckoutResult } from "@/lib/checkout"
import { formatDate, formatDateTime, rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Banner, Button, Empty, Field, Loading, Logo, Sheet, Stepper } from "@/components/ui"

/** yyyy-mm-dd plus whole days, in UTC both ways so no time zone can shift the date. */
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
/** "1 night" / "3 nights". */
const nightsLabel = (t: ReturnType<typeof useI18n>["t"], n: number) => (n === 1 ? t("book.oneNight") : t("book.nights", { n }))
const nightsBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export default function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { t, language, setLanguage } = useI18n()
  const [page, setPage] = useState<BookingPage | null>(null)
  const [missing, setMissing] = useState(false)
  const [arrive, setArrive] = useState("")
  const [depart, setDepart] = useState("")
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [chosen, setChosen] = useState<Offer | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("")
  const [consent, setConsent] = useState(false)
  const [whatsapp, setWhatsapp] = useState(true)
  // One id per attempt: pressing Confirm twice, or retrying after a dropped connection, books once.
  const [attempt, setAttempt] = useState("")
  const [done, setDone] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [payNow, setPayNow] = useState(true)
  // The order of the last payment attempt, so a failed one can be tried again; and the simulator, in development.
  const [lastOrder, setLastOrder] = useState<string | null>(null)
  const [payError, setPayError] = useState("")
  const [simulating, setSimulating] = useState<Checkout | null>(null)

  // The page's address is the external system here: load the property once.
  useEffect(() => {
    getBookingPage(slug)
      .then((p) => {
        setPage(p)
        setArrive(p.today)
        setDepart(addDays(p.today, 1))
      })
      .catch(() => setMissing(true))
  }, [slug])

  const nights = arrive && depart ? nightsBetween(arrive, depart) : 0
  const party = adults + children
  const consentText = useMemo(() => (page ? page.consentText[language] ?? page.consentText.en ?? "" : ""), [page, language])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (e) {
      if (e instanceof PublicApiError && e.status === 404) setMissing(true)
      else setError(e instanceof Error ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  const search = () => run(async () => { setChosen(null); setOffers(await getOffers(slug, arrive, depart)) })

  const confirm = () =>
    run(async () => {
      const booked = await bookOnline(slug, { roomTypeId: chosen?.roomTypeId, arrive, depart, adults, children, name, phone, city, consent, whatsappOptIn: whatsapp, clientUuid: attempt, payNow })
      setDone(booked)
      if (booked.payment) await pay(booked.payment)
    })

  /** Open the gateway's window (or, in development, the simulator) for one payment order. */
  async function pay(checkout: Checkout) {
    setLastOrder(checkout.orderId)
    setPayError("")
    if (checkout.provider === "console") { setSimulating(checkout); return }
    await settle(checkout, await openRazorpay(checkout, { name, contact: phone }, chosen?.name ?? ""))
  }

  /** What the guest did in the payment window. Success is only a claim until the server has checked it. */
  async function settle(checkout: Checkout, result: CheckoutResult) {
    if (result.kind === "paid") {
      setDone(await verifyPayment(slug, { orderId: result.orderId, paymentId: result.paymentId, signature: result.signature }))
      return
    }
    if (result.kind === "failed") await reportPaymentFailure(slug, checkout.orderId, result.reason)
    setPayError(result.kind === "failed" ? result.reason : t("book.payClosed"))
  }

  const payAgain = () => run(async () => { if (lastOrder) await pay(await retryPayment(slug, lastOrder)) })

  const simulate = (succeed: boolean) =>
    run(async () => {
      const checkout = simulating!
      setSimulating(null)
      const r = await simulatePayment(slug, checkout.orderId, succeed)
      await settle(checkout, succeed ? { kind: "paid", ...r } : { kind: "failed", reason: "Declined in the simulator" })
    })

  function choose(offer: Offer) {
    setChosen(offer)
    setAttempt(crypto.randomUUID())
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function startOver() {
    setDone(null)
    setChosen(null)
    setOffers(null)
    setName("")
    setPhone("")
    setCity("")
    setConsent(false)
  }

  return (
    <div className="min-h-dvh">
      <div className="sky">
        <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <span className="flex min-w-0 items-center gap-2.5">
            <Logo />
            <span className="truncate text-[15px] font-extrabold tracking-tight">{page?.name ?? ""}</span>
          </span>
          <button
            onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
            aria-label={t("common.language")}
            className="shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-bg transition-colors hover:bg-ink/85"
          >
            {language === "hi" ? "EN" : "हिं"}
          </button>
        </header>
        {page && !done && (
          <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 text-center md:pb-14 md:pt-10">
            <h1 className="display rise text-balance text-4xl md:text-6xl">{page.name}</h1>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-medium text-ink-soft">
              {(page.address || page.city) && <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden /> {[page.address, page.city].filter(Boolean).join(", ")}</span>}
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden /> {t("book.checkin", { time: page.checkinTime })}</span>
            </p>
          </section>
        )}
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16">
        {missing ? (
          <Empty icon={BedDouble}>{t("book.unavailable")}</Empty>
        ) : !page ? (
          <Loading />
        ) : done ? (
          <Done confirmation={done} onAgain={startOver} onPay={lastOrder ? payAgain : undefined} payError={payError} busy={busy} error={error} />
        ) : chosen ? (
          <form onSubmit={(e) => { e.preventDefault(); void confirm() }} className="space-y-4 pt-6">
            <button type="button" onClick={() => setChosen(null)} className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:text-ink">
              <ArrowLeft size={18} aria-hidden /> {t("book.change")}
            </button>
            <StaySummary offer={chosen} arrive={arrive} depart={depart} party={party} />
            <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-lg font-bold tracking-tight">{t("book.details")}</h2>
              {error && <Banner tone="danger">{error}</Banner>}
              <Field label={t("book.name")}>
                <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("book.phone")}>
                  <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </Field>
                <Field label={t("book.city")}>
                  <input autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
              </div>
              {page.consentRequired && (
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{consentText}</span>
                </label>
              )}
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
                <span>{t("book.whatsapp")}</span>
              </label>
              {page.payment === "optional" && (
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                  <span>{t("book.payNow", { pct: page.advancePct })}</span>
                </label>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim() || phone.replace(/\D/g, "").length < 10 || (page.consentRequired && !consent)}>
                {page.payment === "required" || (page.payment === "optional" && payNow)
                  ? <><CreditCard size={18} aria-hidden /> {t("book.confirmAndPay")}</>
                  : <><Check size={18} aria-hidden /> {t("book.confirm")}</>}
              </Button>
              <p className="text-center text-xs text-ink-soft">
                {page.payment === "required" || (page.payment === "optional" && payNow) ? t("book.payOnlineNote", { pct: page.advancePct }) : t("book.payAtProperty")}
              </p>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); void search() }} className="-mt-6 space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-pop)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("book.arrive")}>
                  <input
                    type="date"
                    value={arrive}
                    min={page.today}
                    max={addDays(page.today, page.daysAhead)}
                    onChange={(e) => {
                      const next = e.target.value
                      setArrive(next)
                      setOffers(null)
                      if (!depart || depart <= next || nightsBetween(next, depart) > page.maxNights) setDepart(addDays(next, 1))
                    }}
                    required
                  />
                </Field>
                <Field label={t("book.depart")} hint={nights > 0 ? nightsLabel(t, nights) : undefined}>
                  <input type="date" value={depart} min={arrive ? addDays(arrive, 1) : undefined} max={arrive ? addDays(arrive, page.maxNights) : undefined}
                    onChange={(e) => { setDepart(e.target.value); setOffers(null) }} required />
                </Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Stepper label={t("checkin.adults")} value={adults} min={1} max={20} onChange={(v) => { setAdults(v); setOffers(null) }} />
                <Stepper label={t("checkin.children")} value={children} min={0} max={20} onChange={(v) => { setChildren(v); setOffers(null) }} />
              </div>
              {error && <Banner tone="danger">{error}</Banner>}
              <Button type="submit" size="lg" className="w-full" disabled={busy || nights < 1}>
                {t("book.search")}
              </Button>
            </form>

            {offers && (
              offers.length === 0 ? <Empty icon={BedDouble}>{t("book.soldOut")}</Empty> : (
                <ul className="space-y-3">
                  {offers.map((offer) => {
                    const fits = party <= offer.maxOccupancy
                    const open = offer.free > 0 && fits
                    return (
                      <li key={offer.roomTypeId} className="anim-pop flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-bold tracking-tight">{offer.name}</h3>
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                            <span className="inline-flex items-center gap-1.5"><Users size={15} aria-hidden /> {t("book.upTo", { n: offer.maxOccupancy })}</span>
                            <span>{t("book.perNight", { amount: rupees(offer.ratePaise) })}</span>
                            {offer.free > 0 && offer.free <= 3 && <span className="font-semibold text-warn">{t("book.left", { n: offer.free })}</span>}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
                          <p className="text-right">
                            <span className="block text-2xl font-extrabold tabular-nums tracking-tight">{rupees(offer.totalPaise)}</span>
                            <span className="text-xs text-ink-soft">{nightsLabel(t, offer.nights)}</span>
                          </p>
                          <Button disabled={!open} onClick={() => choose(offer)}>
                            {offer.free === 0 ? t("book.soldOut") : fits ? t("book.choose") : t("book.tooSmall", { n: party })}
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            )}
            {page.phone && (
              <p className="flex items-center justify-center gap-1.5 pt-2 text-sm text-ink-soft">
                <Phone size={14} aria-hidden /> <a href={`tel:${page.phone}`} className="font-semibold text-ink">{page.phone}</a>
              </p>
            )}
          </>
        )}
      </main>

      {/* Development only: stands in for the gateway's window. */}
      <Sheet open={!!simulating} onOpenChange={(o) => !o && setSimulating(null)} title={t("book.testPayment")} description={simulating ? rupees(simulating.amountPaise) : undefined}
        footer={
          <>
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => simulate(false)}>{t("book.testFail")}</Button>
            <Button className="flex-1" disabled={busy} onClick={() => simulate(true)}>{t("book.testPay")}</Button>
          </>
        }>
        <p className="text-sm text-ink-soft">{t("book.testNote")}</p>
      </Sheet>
    </div>
  )
}

function StaySummary({ offer, arrive, depart, party }: { offer: Offer; arrive: string; depart: string; party: number }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5" style={{ background: "linear-gradient(135deg, var(--sky-top), var(--sky))" }}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("book.stay")}</p>
        <p className="mt-1 text-lg font-bold tracking-tight">{offer.name}</p>
        <p className="text-sm text-ink-soft">{formatDate(arrive)} → {formatDate(depart)} · {nightsLabel(t, offer.nights)} · {party} {t("book.guests").toLowerCase()}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-ink-soft">{t("book.estimate")}</p>
        <p className="text-2xl font-extrabold tabular-nums tracking-tight">{rupees(offer.totalPaise)}</p>
      </div>
    </div>
  )
}

function Done({ confirmation: c, onAgain, onPay, payError, busy, error }: {
  confirmation: Confirmation; onAgain: () => void; onPay?: () => void; payError: string; busy: boolean; error: string
}) {
  const { t } = useI18n()
  const pending = c.status === "pending"
  return (
    <div className="anim-pop space-y-5 pt-8 text-center">
      <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${pending ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
        {pending ? <Clock size={32} aria-hidden /> : <Check size={32} aria-hidden />}
      </span>
      <h1 className="display text-4xl">{pending ? t("book.awaitingPayment") : t("book.done")}</h1>
      {pending && (
        <div className="mx-auto max-w-md space-y-3">
          {c.payment?.holdUntil && <p className="text-sm text-ink-soft">{t("book.heldUntil", { time: formatDateTime(c.payment.holdUntil) })}</p>}
          {payError && <Banner tone="warn">{payError}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          {onPay && <Button size="lg" className="w-full" disabled={busy} onClick={onPay}><CreditCard size={18} aria-hidden /> {t("book.payAgain")}</Button>}
        </div>
      )}
      <div className="mx-auto max-w-md space-y-3 rounded-3xl border border-line bg-surface p-6 text-left shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("book.reference")}</p>
        <p className="font-mono text-3xl font-bold tracking-[.2em]">{c.reference}</p>
        <div className="border-t border-line pt-3 text-sm">
          <p className="font-semibold">{c.guestName} · {c.roomType}</p>
          <p className="text-ink-soft">{formatDate(c.arrive)} → {formatDate(c.depart)} · {nightsLabel(t, c.nights)}</p>
          <p className="text-ink-soft">{t("book.checkin", { time: c.checkinTime })}</p>
          <p className="mt-2 text-lg font-extrabold tabular-nums">{rupees(c.totalPaise)}</p>
          <p className="text-xs text-ink-soft">{c.paidPaise > 0 ? t("book.paidOnline", { amount: rupees(c.paidPaise) }) : pending ? t("book.notPaidYet") : t("book.payAtProperty")}</p>
        </div>
      </div>
      <p className="text-sm text-ink-soft">{t("book.showAtDesk", { phone: c.propertyPhone })}</p>
      <Button variant="secondary" onClick={onAgain}>{t("book.another")}</Button>
    </div>
  )
}
