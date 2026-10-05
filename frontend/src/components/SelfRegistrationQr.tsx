"use client"

/**
 * The register book, handed to the guest.
 *
 * The code is on screen the moment the desk opens check-in: they turn the screen around and the guest scans
 * it with their own phone camera and types their own name, address and ID — the things that used to be
 * written into a paper register while a queue formed. What the guest types lands in the desk's own form while
 * they type it, so the clerk reads it back and carries on with the room and the money.
 *
 * This component owns only the code: minting one, keeping it alive across visits, and replacing it. The
 * session behind it — the guest's answers, the ID photo, the status line — belongs to the check-in screen,
 * which holds it with `useCheckInSession` and passes the state to show back in here. One session, one owner.
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
import { Check, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import type { Draft, SessionStatus, Suggestions } from "@/lib/checkin-fields"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Loading } from "@/components/ui"

type NewLink = { id: string; url: string; qrDataUri: string; expiresAt: string }

/** The desk's view of one self-registration link, as `/api/registrations/{id}` returns it. */
export type Registration = {
  id: string
  state: "open" | "submitted" | "applied" | "revoked"
  status: SessionStatus
  version: number
  draft: Draft
  ocr: Suggestions
  expiresAt: string
  submittedAt: string | null
  submitted: Submission | null
  /** The guest photographed their ID on their own phone; it is attached when the desk applies the registration. */
  hasIdPhoto: boolean
}

/** What the guest sent when they pressed save. The live draft carries the same fields, field by field. */
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
  onLink,
  status,
  connected,
}: {
  bookingId?: string
  /** The session the desk's screen should follow; null while there is none. */
  onLink: (id: string | null) => void
  /** How far the guest has got, straight from the session the check-in screen is holding. */
  status: SessionStatus
  /** Whether the desk's own polling is getting through. */
  connected: boolean
}) {
  const { t } = useI18n()
  const key = storeKey(bookingId)
  const [link, setLink] = useState<NewLink | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  /** The code is taking longer than it should: say so, and let the desk ask for another one. */
  const [slow, setSlow] = useState(false)
  const [copied, setCopied] = useState(false)
  const bootstrapped = useRef<string | null>(null)

  const start = useCallback(async () => {
    setBusy(true)
    setError("")
    setCopied(false)
    setSlow(false)
    // The request is not cancelled when it runs long — a sleeping server answers in its own time and the code
    // then appears — but after this the desk is told why it is waiting and the retry stops being greyed out.
    const slowTimer = setTimeout(() => setSlow(true), 8000)
    try {
      // A new code retires the old one by itself: the desk's screen stops following the previous session the
      // moment this one is reported upward, and the old link dies at its own expiry.
      const fresh = await api<NewLink>("/api/registrations", { method: "POST", body: { bookingId: bookingId ?? null } })
      store(key, fresh)
      setLink(fresh)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("selfreg.failed"))
    } finally {
      clearTimeout(slowTimer)
      setBusy(false)
      setSlow(false)
    }
  }, [bookingId, key, t])

  // On arrival: the code this tab already has, if the server still has a live session for it, else a new one.
  // Claimed synchronously, because development mounts every component twice and two mints would be two audit lines.
  useEffect(() => {
    if (bootstrapped.current === key) return
    bootstrapped.current = key
    void (async () => {
      const kept = readStored(key)
      if (kept) {
        try {
          // Checking the kept code must not become its own wait: if the server does not answer promptly,
          // stop asking and mint a fresh one, which is what would have happened had nothing been kept.
          const reg = await Promise.race([
            api<Registration>(`/api/registrations/${kept.id}`),
            new Promise<never>((_, fail) => setTimeout(() => fail(new Error("slow")), 6000)),
          ])
          // A session the guest has already filled in is still the one to follow: the desk reloading its
          // browser must come back to the guest's details, not to an empty new code.
          if (reg.state !== "revoked" && new Date(reg.expiresAt) > new Date()) { setLink(kept); return }
        } catch {
          /* gone, or another property's: mint a new one below */
        }
        store(key, null)
      }
      await start()
    })()
  }, [key, start])

  // Whoever is holding the session gets told which one it is.
  useEffect(() => { onLink(link?.id ?? null) }, [link, onLink])

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

  const newCode = (
    <Button variant={status === "submitted" ? "soft" : "ghost"} size="sm" className={status === "submitted" ? "w-full" : undefined} onClick={start} disabled={busy && !slow}>
      <RefreshCw size={16} aria-hidden /> {t("selfreg.newCode")}
    </Button>
  )

  // Once the guest has sent their details the code has done its job; the form beside it now holds them.
  if (status === "submitted") {
    return (
      <Card className="space-y-3 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ok">
          <Check size={16} aria-hidden /> {t("selfreg.done")}
        </p>
        {newCode}
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
          className="press mx-auto block w-full max-w-[260px] rounded-2xl bg-white p-2 shadow-[var(--shadow-card)]"
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

      {link ? <GuestStatus status={status} connected={connected} /> : slow && <p className="text-sm text-ink-soft">{t("selfreg.slow")}</p>}
      {error && <Banner tone="warn">{error}</Banner>}
      {newCode}
    </Card>
  )
}

/**
 * Where the guest has got to, in words — shown once, in the panel the QR code is in, which is beside the
 * form on a laptop and above it on a phone. The light is the desk's own connection: a dropped poll says so
 * instead of leaving a stale "waiting" on screen looking like the guest never arrived.
 */
function GuestStatus({ status, connected }: { status: SessionStatus; connected: boolean }) {
  const { t } = useI18n()
  const live = status !== "waiting"
  return (
    <p aria-live="polite" className={clsx("inline-flex items-center gap-2 text-sm font-semibold", live ? "text-ok" : "text-brand-ink")}>
      {connected ? (
        <span className={clsx("h-2 w-2 rounded-full", live ? "bg-ok" : "animate-pulse bg-brand")} aria-hidden />
      ) : (
        <WifiOff size={14} className="text-warn" aria-hidden />
      )}
      {connected ? t(`selfreg.status.${status}` as "selfreg.status.waiting") : t("selfreg.reconnecting")}
      {connected && live && <Wifi size={13} className="text-ok" aria-hidden />}
    </p>
  )
}
