"use client"

/**
 * The register book, handed to the guest.
 *
 * The desk taps once, turns the screen around, and the guest scans the code with their own phone camera and
 * types their own name, address and ID — the things that used to be written into a paper register while a
 * queue formed. The desk keeps watching this panel: the moment the guest presses send, the details drop
 * into the check-in form and the desk carries on with the room and the money.
 *
 * The QR image is built by the server, so the code on screen is exactly the link the server issued and
 * nothing in the browser can quietly change where it points.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { QrCode, RefreshCw, X } from "lucide-react"
import { api } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, IconButton, Loading } from "@/components/ui"

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

type Registration = {
  id: string
  state: "open" | "submitted" | "applied" | "revoked"
  expiresAt: string
  submittedAt: string | null
  submitted: Submission | null
  hasIdPhoto: boolean
}

/** How often the desk asks whether the guest has pressed send. Cheap, and the desk is watching the screen. */
const POLL_MS = 2000

export function SelfRegistrationQr({
  bookingId,
  onReceived,
}: {
  bookingId?: string
  /** Called once, with what the guest typed, so the caller can fill its own form. */
  onReceived: (submission: Submission, registrationId: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<NewLink | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const delivered = useRef(false)

  const start = useCallback(async () => {
    setBusy(true)
    setError("")
    delivered.current = false
    try {
      setLink(await api<NewLink>("/api/registrations", { method: "POST", body: { bookingId: bookingId ?? null } }))
      setOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("selfreg.failed"))
    } finally {
      setBusy(false)
    }
  }, [bookingId, t])

  // Watch the link until the guest sends, the link dies, or the desk closes the panel.
  useEffect(() => {
    if (!open || !link) return
    let live = true
    const timer = setInterval(async () => {
      try {
        const reg = await api<Registration>(`/api/registrations/${link.id}`)
        if (!live) return
        if (reg.submitted && !delivered.current) {
          delivered.current = true
          onReceived(reg.submitted, reg.id)
          setOpen(false)
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
  }, [open, link, onReceived, t])

  if (!open) {
    return (
      <div className="space-y-1">
        <Button variant="soft" className="w-full" onClick={start} disabled={busy}>
          <QrCode size={20} aria-hidden /> {t("selfreg.button")}
        </Button>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    )
  }

  return (
    <Card className="space-y-3 border-brand/30 text-center">
      <div className="flex items-start justify-between gap-2">
        <div className="text-left">
          <p className="font-semibold">{t("selfreg.showTitle")}</p>
          <p className="text-sm text-ink-soft">{t("selfreg.showHint")}</p>
        </div>
        <IconButton label={t("action.close")} onClick={() => setOpen(false)} className="-mr-2 -mt-2"><X size={18} aria-hidden /></IconButton>
      </div>

      {link ? (
        /* Sized to fill a phone held out at arm's length; a smaller code is a slower scan.
           A plain <img>: the source is an inline data URI the server already rendered, so there is no
           remote image for next/image to fetch, resize or cache. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link.qrDataUri} alt={t("selfreg.showTitle")} className="mx-auto w-full max-w-[260px] rounded-2xl border border-line bg-white p-2" />
      ) : (
        <Loading />
      )}

      <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden /> {t("selfreg.waiting")}</p>
      {error && <Banner tone="warn">{error}</Banner>}

      <Button variant="ghost" size="sm" onClick={start} disabled={busy}>
        <RefreshCw size={16} aria-hidden /> {t("selfreg.newCode")}
      </Button>
    </Card>
  )
}
