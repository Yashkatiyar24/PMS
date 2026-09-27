"use client"

/**
 * The guest looking at their own stay, on their own phone, with no account.
 *
 * One screen, read only: where they are staying, when, what it costs, what is still to pay, and their bills.
 * Nothing here can be changed by the person holding the link — settling a bill and changing a booking both
 * happen at the desk, which is why the only buttons are "call the property" and "download".
 *
 * The token in the URL is the whole credential, exactly as on the self-registration form, so this screen
 * carries its own strings rather than the desk app's: the language belongs to the property, not the phone.
 */
import { use, useEffect, useState } from "react"
import { BedDouble, CalendarDays, Download, MapPin, Phone, Receipt, Users } from "lucide-react"
import { getStay, PublicApiError, type StayView } from "@/lib/public-api"
import { formatDate } from "@/lib/format"
import { Banner, Card, Chip, Empty, KV, Loading, Logo } from "@/components/ui"

const TEXT = {
  hi: {
    lead: "आपकी बुक की जानकारी",
    reference: "बुक नंबर",
    stay: "आपका कमरा",
    room: "कमरा", roomType: "कमरे का प्रकार", guests: "लोग",
    arrive: "आने की तारीख़", depart: "जाने की तारीख़",
    checkin: "आने का समय", checkout: "जाने का समय",
    nights: (n: number) => (n === 1 ? "1 रात" : `${n} रातें`),
    people: (a: number, c: number) => {
      const adults = a === 1 ? "1 बड़ा" : `${a} बड़े`
      return c > 0 ? `${adults}, ${c === 1 ? "1 बच्चा" : `${c} बच्चे`}` : adults
    },
    money: "पैसों का हिसाब",
    total: "कुल चार्ज", deposit: "जमानत (डिपॉज़िट)", paid: "जमा", due: "बाकी", refund: "आपको वापस मिलेगा",
    settled: "पूरा भुगतान हो चुका है।",
    dueHint: "बाकी रकम रिसेप्शन पर दे सकते हैं।",
    refundHint: "यह रकम रिसेप्शन से वापस ले सकते हैं।",
    bills: "रसीदें",
    noBills: "अभी कोई रसीद नहीं है। चेक-इन के बाद यहाँ दिखेगी।",
    download: "डाउनलोड",
    call: "प्रॉपर्टी को कॉल करें",
    expired: "यह लिंक अब काम नहीं करता। रिसेप्शन से नया लिंक मांगें।",
    failed: "कुछ गड़बड़ हुई। फिर कोशिश करें।",
    status: { reserved: "बुक है", pending: "भुगतान बाकी", checked_in: "आप ठहरे हुए हैं", checked_out: "आप जा चुके हैं", cancelled: "रद्द", no_show: "रद्द" } as Record<string, string>,
  },
  en: {
    lead: "Your booking",
    reference: "Booking number",
    stay: "Your room",
    room: "Room", roomType: "Room type", guests: "People",
    arrive: "Arrival", depart: "Departure",
    checkin: "Check-in time", checkout: "Check-out time",
    nights: (n: number) => (n === 1 ? "1 night" : `${n} nights`),
    people: (a: number, c: number) => {
      const adults = a === 1 ? "1 adult" : `${a} adults`
      return c > 0 ? `${adults}, ${c === 1 ? "1 child" : `${c} children`}` : adults
    },
    money: "Payment",
    total: "Total charge", deposit: "Deposit held", paid: "Paid", due: "Still to pay", refund: "To be refunded to you",
    settled: "Everything is paid.",
    dueHint: "You can pay the balance at the desk.",
    refundHint: "Collect this from the desk.",
    bills: "Receipts",
    noBills: "No receipt yet. It will appear here after check-in.",
    download: "Download",
    call: "Call the property",
    expired: "This link no longer works. Please ask the desk for a new one.",
    failed: "Something went wrong. Please try again.",
    status: { reserved: "Booked", pending: "Payment pending", checked_in: "You are staying", checked_out: "Checked out", cancelled: "Cancelled", no_show: "Cancelled" } as Record<string, string>,
  },
} as const

const TONE: Record<string, "ok" | "warn" | "neutral" | "danger"> = {
  reserved: "ok", pending: "warn", checked_in: "ok", checked_out: "neutral", cancelled: "danger", no_show: "danger",
}

export default function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [stay, setStay] = useState<StayView | null>(null)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getStay(token)
      .then(setStay)
      .catch((e) => (e instanceof PublicApiError && e.status === 404 ? setGone(true) : setError(String(e))))
  }, [token])

  // Before the stay loads there is no property language to obey, and Hindi is the one to guess wrong in.
  const t = TEXT[stay?.language ?? "hi"]

  if (gone) return <Shell><Empty icon={CalendarDays}>{t.expired}</Empty></Shell>
  if (error) return <Shell><Banner tone="danger">{t.failed}</Banner></Shell>
  if (!stay) return <Shell><Loading rows={4} /></Shell>

  return (
    <Shell>
      <header className="space-y-1 text-center">
        <h1 className="display text-3xl">{stay.propertyName}</h1>
        {stay.propertyAddress && (
          <p className="flex items-center justify-center gap-1 text-sm text-ink-soft"><MapPin size={14} aria-hidden /> {stay.propertyAddress}</p>
        )}
        <p className="text-sm text-ink-soft">{t.lead}</p>
      </header>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t.reference}</p>
            <p className="font-mono text-2xl font-bold tracking-[.2em]">{stay.reference}</p>
          </div>
          <Chip tone={TONE[stay.status] ?? "neutral"}>{t.status[stay.status] ?? stay.status}</Chip>
        </div>
        <p className="mt-2 border-t border-line pt-2 font-semibold">{stay.guestName}</p>
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><BedDouble size={18} aria-hidden /> {t.stay}</h2>
        <dl>
          {stay.rooms && <KV label={t.room} value={stay.rooms} strong />}
          {stay.roomType && <KV label={t.roomType} value={stay.roomType} />}
          <KV label={t.arrive} value={`${formatDate(stay.arrive)} · ${stay.checkinTime}`} />
          <KV label={t.depart} value={`${formatDate(stay.depart)} · ${stay.checkoutTime}`} />
          <KV label={t.nights(stay.nights)} value={<span className="flex items-center gap-1"><Users size={14} aria-hidden /> {t.people(stay.adults, stay.children)}</span>} />
        </dl>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">{t.money}</h2>
        <dl>
          <KV label={t.total} value={stay.total} />
          {/* A deposit is money held, not a charge; without its own line the total and the balance look wrong. */}
          {stay.depositPaise !== 0 && <KV label={t.deposit} value={stay.deposit} />}
          <KV label={t.paid} value={stay.paid} />
          <KV
            label={stay.duePaise < 0 ? t.refund : t.due}
            value={stay.due}
            strong
            tone={stay.duePaise > 0 ? "warn" : "ok"}
          />
        </dl>
        <p className="mt-2 text-sm text-ink-soft">
          {stay.duePaise > 0 ? t.dueHint : stay.duePaise < 0 ? t.refundHint : t.settled}
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><Receipt size={18} aria-hidden /> {t.bills}</h2>
        {stay.bills.length === 0 ? (
          <p className="py-2 text-sm text-ink-soft">{t.noBills}</p>
        ) : (
          <ul className="divide-y divide-line">
            {stay.bills.map((b) => (
              <li key={b.number} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold">{b.number}</p>
                  <p className="text-xs text-ink-soft">{formatDate(b.issuedAt)}</p>
                </div>
                <span className="tabular-nums font-semibold">{b.amount}</span>
                {b.url && (
                  <a href={b.url} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand" download>
                    <Download size={16} aria-hidden /> {t.download}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {stay.propertyPhone && (
        <a
          href={`tel:${stay.propertyPhone}`}
          className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3 font-semibold shadow-[var(--shadow-card)]"
        >
          <Phone size={18} aria-hidden /> {t.call}
        </a>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-4 px-4 py-8">
      <div className="flex justify-center pb-2"><Logo size={40} /></div>
      {children}
    </main>
  )
}
