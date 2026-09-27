"use client"

/**
 * The register book, handed to the guest.
 *
 * The code is on screen the moment the desk opens check-in: they turn the screen around and the guest scans
 * it with their own phone camera and types their own name, address and ID — the things that used to be
 * written into a paper register while a queue formed. The desk keeps watching this panel: the moment the
 * guest presses save, the details drop into the check-in form and the desk carries on with the room and the money.
 *
 * A code that is still live is reused when the desk comes back to this screen, rather than a fresh one being
 * minted on every visit: each mint is a row and a line in the property's own audit log, and a desk that opens
 * check-in forty times a day should not leave forty of either behind.
 *
 * The QR image is built by the server, so the code on screen is exactly the link the server issued and
 * nothing in the browser can quietly change where it points. Tapping the code copies that same link, for the
 * guest whose camera will not scan: the desk pastes it into WhatsApp instead.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, RefreshCw } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Loading } from "@/components/ui"

type NewLink = { id: string; url: string; qrDataUri: string; expiresAt: string }

export type Submission = {
  name: string
  phone: string
  city: string
  address: string
  nationality: string
  idType: string | null
  idLast4: string | null
  passportNo: string | null
  adults: number
  children: number
  members: { name: string; adult: boolean }[]
  consent: boolean
  whatsappOptIn: boolean
}

export type Registration = {
  id: string
  state: "open" | "submitted" | "applied" | "revoked"
  expiresAt: string
  submittedAt: string | null
  submitted: Submission | null
  /** The guest photographed their ID on their own phone; it is attached when the desk applies the registration. */
  hasIdPhoto: boolean
}

/** How often the desk asks whether the guest has pressed save. Cheap, and the desk is watching the screen. */
const POLL_MS = 2000

/**
 * The live code, kept for this tab only so that returning to check-in shows the same one instead of minting
 * another. It holds the same link the code on screen already shows, it dies with the tab, and it is dropped
 * the moment the guest uses it.
 */
const storeKey = (bookingId?: string) => `pms.selfreg.${bookingId ?? "walk-in"}`
function readStored(key: string): NewLink | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const link = JSON.parse(raw) as NewLink
    return link?.id && new Date(link.expiresAt) > new Date() ? link : null
  } catch {
    return null // private window, or storage the browser refuses: a new code is minted instead
  }
}
function store(key: string, link: NewLink | null) {
  try {
    if (link) sessionStorage.setItem(key, JSON.stringify(link))
    else sessionStorage.removeItem(key)
  } catch {
    /* not remembered */
  }
}

/** Over plain http (a LAN address in development) the async clipboard is missing, so fall back to select-and-copy. */
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const box = Object.assign(document.createElement("textarea"), { value: text })
  document.body.append(box)
  box.select()
  document.execCommand("copy")
  box.remove()
}

export function SelfRegistrationQr({
  bookingId,
  onReceived,
}: {
  bookingId?: string
  /** Called once, with what the guest typed and the registration it came from, so the caller can fill its own form. */
  onReceived: (submission: Submission, registration: Registration) => void
}) {
  const { t } = useI18n()
  const key = storeKey(bookingId)
  const [link, setLink] = useState<NewLink | null>(null)
  const [received, setReceived] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const delivered = useRef(false)
  const bootstrapped = useRef<string | null>(null)

  const start = useCallback(async () => {
    setBusy(true)
    setError("")
    setCopied(false)
    setReceived(false)
    delivered.current = false
    try {
      const fresh = await api<NewLink>("/api/registrations", { method: "POST", body: { bookingId: bookingId ?? null } })
      store(key, fresh)
      setLink(fresh)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("selfreg.failed"))
    } finally {
      setBusy(false)
    }
  }, [bookingId, key, t])

  // On arrival: the code this tab already has, if the server still calls it open, else a new one. Claimed
  // synchronously, because development mounts every component twice and two mints would be two audit lines.
  useEffect(() => {
    if (bootstrapped.current === key) return
    bootstrapped.current = key
    void (async () => {
      const kept = readStored(key)
      if (kept) {
        try {
          const reg = await api<Registration>(`/api/registrations/${kept.id}`)
          if (reg.state === "open" && new Date(reg.expiresAt) > new Date()) { setLink(kept); return }
        } catch {
          /* gone, or another property's: mint a new one below */
        }
        store(key, null)
      }
      await start()
    })()
  }, [key, start])

  const copy = useCallback(async () => {
    if (!link) return
    try {
      await copyText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* nothing to copy with; the code on screen still scans */
    }
  }, [link])

  // Watch the link until the guest saves or it dies.
  useEffect(() => {
    if (!link || received) return
    let live = true
    const timer = setInterval(async () => {
      try {
        const reg = await api<Registration>(`/api/registrations/${link.id}`)
        if (!live) return
        if (reg.submitted && !delivered.current) {
          delivered.current = true
          onReceived(reg.submitted, reg)
          store(key, null) // used up: the next guest gets a code of their own
          setReceived(true)
        }
        if (new Date(reg.expiresAt) < new Date()) setError(t("selfreg.expired"))
      } catch {
        /* a dropped poll is not worth showing; the next one will tell the same story */
      }
    }, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [link, received, onReceived, key, t])

  // Once the guest has sent their details the code has done its job; the form below now holds them.
  if (received) {
    return (
      <Card className="space-y-3 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ok">
          <Check size={16} aria-hidden /> {t("selfreg.done")}
        </p>
        <Button variant="soft" className="w-full" onClick={start} disabled={busy}>
          <RefreshCw size={16} aria-hidden /> {t("selfreg.newCode")}
        </Button>
      </Card>
    )
  }

  return (
    <Card className="space-y-3 border-brand/30 text-center">
      <div className="text-left">
        <p className="font-semibold">{t("selfreg.showTitle")}</p>
        <p className="text-sm text-ink-soft">{t("selfreg.showHint")}</p>
      </div>

      {link ? (
        /* Sized to fill a phone held out at arm's length; a smaller code is a slower scan.
           A plain <img>: the source is an inline data URI the server already rendered, so there is no
           remote image for next/image to fetch, resize or cache. */
        <button
          type="button"
          onClick={copy}
          aria-label={t("selfreg.copyHint")}
          className="mx-auto block w-full max-w-[260px] rounded-2xl border border-line bg-white p-2 transition-transform active:scale-[.985]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={link.qrDataUri} alt={t("selfreg.showTitle")} className="w-full" />
        </button>
      ) : (
        <Loading />
      )}
      <p aria-live="polite" className={clsx("text-xs", copied ? "font-semibold text-ok" : "text-ink-faint")}>
        {copied ? <><Check size={14} className="inline align-text-bottom" aria-hidden /> {t("selfreg.copied")}</> : t("selfreg.copyHint")}
      </p>

      <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden /> {t("selfreg.waiting")}</p>
      {error && <Banner tone="warn">{error}</Banner>}

      <Button variant="ghost" size="sm" onClick={start} disabled={busy}>
        <RefreshCw size={16} aria-hidden /> {t("selfreg.newCode")}
      </Button>
    </Card>
  )
}
