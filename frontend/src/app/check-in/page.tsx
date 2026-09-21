"use client"

/**
 * Walk-in check-in (PRD Flow A). The target is under 60 seconds from first tap to receipt, so it is one
 * screen in the order the desk actually asks: who, which bed, what did they pay. Each step unfolds as the
 * one before it is answered (or on a tap, for a desk that wants to jump ahead) and never folds back, so a
 * fresh screen asks one thing and nothing vanishes mid-edit. The register's extra questions (address, ID,
 * photo) fold away until the desk needs them.
 *
 * Nothing here blocks on the network. If the phone is offline the whole check-in is stored on the device
 * with a client id and replayed later; the desk sees it saved either way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera, Check, ChevronDown, Search } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError, newClientUuid, QueuedOffline, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { rupees, toPaise, unitName } from "@/lib/format"
import { OFF_SALE, type Booking, type Guest, type Room, type RoomType } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, ChoiceChips, Disclosure, Field, Loading, PageHeader, Stepper } from "@/components/ui"
import { SelfRegistrationQr, type Registration, type Submission } from "@/components/SelfRegistrationQr"

type Settings = Record<string, unknown>

const ID_TYPES = ["aadhaar", "voter", "dl", "passport", "other"] as const

/** Numbered section header: the desk reads the screen top to bottom, in this order. */
function Step({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 font-semibold">
      <span className={clsx("grid h-6 w-6 place-items-center rounded-full text-xs font-bold", done ? "bg-ok text-on-solid" : "bg-brand-soft text-brand-ink")}>
        {done ? <Check size={14} aria-hidden /> : n}
      </span>
      {title}
    </h2>
  )
}

/** A step the desk has not reached yet: its name and number only, and a tap opens it early. */
function FoldedStep({ n, title, onOpen }: { n: number; title: string; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={onOpen}
      className="flex min-h-[56px] w-full items-center gap-2.5 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-4 text-left transition-colors hover:bg-surface-2"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink-soft">{n}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink-soft">{title}</span>
        <span className="block text-xs text-ink-faint">{t("checkin.stepOf", { n, total: 3 })}</span>
      </span>
      <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-faint" />
    </button>
  )
}

export default function CheckInPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()
  const started = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [types, setTypes] = useState<RoomType[]>([])

  const [phone, setPhone] = useState("")
  const [matches, setMatches] = useState<Guest[]>([])
  const [guestId, setGuestId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [city, setCity] = useState("")
  const [address, setAddress] = useState("")
  const [idType, setIdType] = useState("voter")
  const [idLast4, setIdLast4] = useState("")
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [skipReason, setSkipReason] = useState("")
  // The guest filled the form on their own phone: which link it was, and whether an ID photo came with it.
  const [registration, setRegistration] = useState<Pick<Registration, "id" | "hasIdPhoto"> | null>(null)

  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [typeName, setTypeName] = useState("")
  const [unitKey, setUnitKey] = useState(search.get("room") ? `${search.get("room")}:${search.get("bed") ?? ""}` : "")
  const [nights, setNights] = useState(1)
  const [advance, setAdvance] = useState("")
  const [deposit, setDeposit] = useState("")
  const [mode, setMode] = useState("cash")
  const [consent, setConsent] = useState(false)
  const [optIn, setOptIn] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // Steps the desk has reached, by answering one or by tapping ahead. Once reached, a step stays open.
  const [opened, setOpened] = useState(1)
  const reach = useCallback((n: number) => setOpened((o) => Math.max(o, n)), [])

  useEffect(() => {
    started.current = Date.now()
    void (async () => {
      const [s, r, ty] = await Promise.all([api<Settings>("/api/settings"), api<Room[]>("/api/rooms"), api<RoomType[]>("/api/room-types")])
      setSettings(s)
      setRooms(r)
      setTypes(ty)
      setDeposit(String(Number(s.deposit_default_paise ?? 0) / 100 || ""))
      setMode(String((s.payment_modes as string[])?.[0] ?? "cash"))
    })()
  }, [])

  /**
   * Free units for tonight, grouped by type, with the rate the desk will charge. A unit with a guest in it, or
   * one reserved for today, is left out; the server would refuse it anyway. A room still to be cleaned is
   * offered (when the property allows it) with an amber dot, so nobody sends a guest to it unawares.
   */
  const options = useMemo(() => {
    const byType = new Map<string, { label: string; key: string; ratePaise: number; dirty: boolean }[]>()
    for (const room of rooms) {
      if (!room.active || OFF_SALE.includes(room.status) || room.occupancy) continue
      const type = types.find((x) => x.id === room.roomTypeId)
      if (!type) continue
      const entries = byType.get(type.name) ?? []
      const dirty = room.status === "dirty" || room.status === "cleaning"
      if (type.dormitory) {
        for (const bed of room.beds.filter((b) => b.active && !b.occupancy)) entries.push({ label: unitName(room.number, bed.label), key: `${room.id}:${bed.id}`, ratePaise: type.baseRatePaise, dirty })
      } else {
        entries.push({ label: room.number, key: `${room.id}:`, ratePaise: type.baseRatePaise, dirty })
      }
      byType.set(type.name, entries)
    }
    return byType
  }, [rooms, types])

  // The chosen type follows a preselected unit (from the tape chart), else the first type listed.
  const activeType = typeName || [...options.entries()].find(([, es]) => es.some((e) => e.key === unitKey))?.[0] || [...options.keys()][0] || ""
  const units = options.get(activeType) ?? []
  const chosen = [...options.values()].flat().find((e) => e.key === unitKey)
  const chosenRate = chosen?.ratePaise ?? 0

  const lookup = useCallback(async () => {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 4) return
    try {
      setMatches(await api<Guest[]>(`/api/guests?phone=${encodeURIComponent(digits)}`))
    } catch {
      setMatches([])
    }
  }, [phone])

  function applyExistingGuest(guest: Guest) {
    setGuestId(guest.id)
    setName(guest.name)
    setCity(guest.city)
    setAddress(guest.address)
    setIdType(guest.idType ?? "voter")
    setIdLast4(guest.idLast4 ?? "")
    setMatches([])
  }

  async function pickPhoto(file: File) {
    setPhoto(await compressImage(file, Number(settings?.id_photo_max_kb ?? 300)))
  }

  const photoRequired = Boolean(settings?.id_photo_required)
  const consentRequired = Boolean(settings?.consent_required)
  const guestPhoto = Boolean(registration?.hasIdPhoto)
  // What still stands between the desk and the receipt, in the order the screen asks. Shown beside the button,
  // because a greyed-out button with no reason reads as broken.
  const missing = !name.trim() ? t("checkin.need.name")
    : !unitKey ? t("checkin.need.room")
    : consentRequired && !consent ? t("checkin.need.consent")
    : photoRequired && !photo && !guestPhoto && !skipReason.trim() ? t("checkin.need.photo")
    : ""
  const canSubmit = !missing

  async function submit() {
    setBusy(true)
    setError("")
    const [roomId, bedId] = unitKey.split(":")
    const clientUuid = newClientUuid()
    const newGuest = { name: name.trim(), phone, city, address, nationality: "IN", idType, idLast4, notes: "" }
    try {
      let guest = guestId
      // Details the guest typed on their own phone become the guest record, their ID photo included, with whatever
      // the desk corrected on screen. Remembered, so a check-in the server refuses is not applied twice on retry.
      // Offline, the plain path below still queues the check-in; only the guest's photo is left behind.
      if (!guest && registration) {
        try {
          guest = (await api<{ guestId: string }>(`/api/registrations/${registration.id}/apply`, { method: "POST", body: newGuest })).guestId
          setGuestId(guest)
        } catch (e) {
          if (!(e instanceof TypeError)) throw e
        }
      }
      // A photo needs a guest row to hang on, so an existing guest gets theirs uploaded first.
      if (photo && guest) await upload(`/api/guests/${guest}/id-photo`, photo, "id.jpg")

      const booking = await api<Booking>("/api/bookings/check-in", {
        method: "POST",
        clientUuid,
        queueWhenOffline: true,
        body: {
          guestId: guest,
          newGuest: guest ? null : newGuest,
          units: [{ roomId, bedId: bedId || null, ratePaise: null }],
          nights,
          adults,
          children,
          members: null,
          purpose: "pilgrimage",
          notes: "",
          consent,
          whatsappOptIn: optIn,
          idPhotoSkippedReason: photo || guestPhoto ? null : skipReason.trim() || null,
          advancePaise: toPaise(advance),
          advanceMode: mode,
          depositPaise: toPaise(deposit),
        },
      })

      // A new guest only gets an id once the server replies, so their photo is uploaded now.
      if (photo && !guest) await upload(`/api/guests/${booking.guestId}/id-photo`, photo, "id.jpg")

      const seconds = Math.round((Date.now() - (started.current ?? Date.now())) / 1000)
      router.push(`/stays/${booking.id}?checkedIn=${seconds}`)
    } catch (e) {
      if (e instanceof QueuedOffline) {
        window.dispatchEvent(new CustomEvent("pms:queued"))
        setNotice(t("error.offlineSaved"))
        setTimeout(() => router.push("/"), 1500)
        return
      }
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  /** The guest pressed save on their own phone: their answers fill this form for the desk to read back. */
  const applySelfRegistration = useCallback((sub: Submission, reg: Registration) => {
    setName(sub.name)
    if (sub.phone) setPhone(sub.phone)
    setCity(sub.city ?? "")
    setAddress(sub.address ?? "")
    if (sub.idType) setIdType(sub.idType)
    if (sub.idLast4) setIdLast4(sub.idLast4)
    setAdults(sub.adults || 1)
    setChildren(sub.children || 0)
    setConsent(sub.consent)
    setOptIn(sub.whatsappOptIn)
    setGuestId(null)
    setRegistration({ id: reg.id, hasIdPhoto: reg.hasIdPhoto })
    setNotice(t("selfreg.received", { name: sub.name }))
  }, [t])

  if (!settings) return <Loading />

  const paymentModes = (settings.payment_modes as string[]) ?? ["cash"]
  const total = chosenRate * nights
  const shown = Math.max(opened, unitKey ? 3 : name.trim() ? 2 : 1)

  // The total, the one button that matters, and why it is waiting. Pinned under the thumb on a phone; a card
  // beside the form on a laptop.
  const totalBlock = (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-ink-soft">{t("checkin.total")}</p>
      <p className="text-lg font-bold tabular-nums leading-tight">{rupees(total)} <span className="whitespace-nowrap text-xs font-normal text-ink-soft">{chosenRate > 0 && `${rupees(chosenRate)} × ${nights}`}</span></p>
    </div>
  )
  const hint = missing && <p className="text-xs font-medium text-warn">{missing}</p>
  const submitButton = (
    <Button size="lg" className="min-w-[45%] lg:w-full" disabled={!canSubmit || busy} onClick={submit}>
      <Check size={20} aria-hidden /> {t("checkin.submit")}
    </Button>
  )

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <PageHeader title={t("action.checkIn")} back="/" />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {notice && <Banner tone="info" onClose={() => setNotice("")}>{notice}</Banner>}

      {/* A phone reads top to bottom: the QR handover, then the steps, with the total pinned below. A laptop has
          room for the handover and the total to sit beside the form, so the desk sees the code and the form at once. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          {Boolean(settings.self_registration_enabled) && <SelfRegistrationQr onReceived={applySelfRegistration} />}
          <Card className="hidden space-y-2 lg:block">{totalBlock}{hint}{submitButton}</Card>
        </aside>

        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
      {/* 1 · Guest */}
      <Card>
        <Step n={1} title={t("checkin.guest")} done={!!name.trim()} />
        <div className="space-y-3">
          <Field label={t("checkin.phoneLookup")} hint={t("checkin.phoneHint")}>
            <div className="flex gap-2">
              <input inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value); setGuestId(null) }} onBlur={lookup} placeholder="9876543210" />
              <Button variant="secondary" onClick={lookup} aria-label={t("action.search")}><Search size={18} aria-hidden /></Button>
            </div>
          </Field>

          {matches.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-line divide-y divide-line">
              {matches.map((guest) => (
                <li key={guest.id}>
                  <button onClick={() => applyExistingGuest(guest)} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="font-semibold">{guest.name}</span>
                    <span className="text-sm text-ink-soft">{guest.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label={t("checkin.name")}>
              <input value={name} onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) reach(2) }} autoComplete="name" />
            </Field>
            {guestId && <Chip tone="ok" className="mb-3">{t("checkin.guest")}</Chip>}
          </div>
          <Field label={t("checkin.city")}>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Disclosure
        title={t("checkin.moreDetails")}
        summary={[idType && t(`id.${idType}` as "id.aadhaar"), idLast4 && `••${idLast4}`, photo ? `${Math.round(photo.size / 1024)} KB` : guestPhoto && t("selfreg.photoReceived")].filter(Boolean).join(" · ") || undefined}
        defaultOpen={photoRequired}
      >
        <div className="space-y-3">
          <Field group label={t("checkin.idType")}>
            <ChoiceChips value={idType} onChange={setIdType} options={ID_TYPES.map((value) => ({ value, label: t(`id.${value}` as "id.aadhaar") }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("checkin.idLast4")} hint={t("checkin.idLast4Hint")}>
              <input value={idLast4} maxLength={4} inputMode="numeric" onChange={(e) => setIdLast4(e.target.value)} />
            </Field>
            <Field label={t("setup.address")}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </div>
          <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <Camera size={18} aria-hidden /> {t("checkin.takePhoto")}
            </Button>
            {photo ? <Chip tone="ok">{Math.round(photo.size / 1024)} KB</Chip> : guestPhoto && <Chip tone="ok">{t("selfreg.photoReceived")}</Chip>}
          </div>
          {photoRequired && !photo && !guestPhoto && (
            <Field label={t("checkin.skipReason")}>
              <input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
            </Field>
          )}
        </div>
      </Disclosure>

      {/* 2 · Room */}
      {shown < 2 ? (
        <FoldedStep n={2} title={t("checkin.stepRoom")} onOpen={() => reach(2)} />
      ) : (
      <Card>
        <Step n={2} title={t("checkin.stepRoom")} done={!!unitKey} />
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stepper label={t("checkin.adults")} value={adults} min={1} onChange={setAdults} />
            <Stepper label={t("checkin.children")} value={children} onChange={setChildren} />
            <Stepper label={t("checkin.nights")} value={nights} min={1} onChange={setNights} />
          </div>

          <Field group label={t("booking.roomType")}>
            <ChoiceChips
              value={activeType}
              onChange={(v) => { setTypeName(v); setUnitKey("") }}
              options={[...options.entries()].map(([name, es]) => ({ value: name, label: `${name} · ${rupees(es[0]?.ratePaise ?? 0)}` }))}
            />
          </Field>

          <Field group label={t("checkin.pickRoom")}>
            {units.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("today.noneFree")}</p>
            ) : (
              <div className="scroll-thin flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {units.map((u) => {
                  const on = u.key === unitKey
                  return (
                    <button
                      key={u.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => { setUnitKey(u.key); reach(3) }}
                      className={clsx("min-h-[44px] min-w-[64px] rounded-xl border px-3 text-[15px] font-bold tabular-nums transition-colors", on ? "border-brand bg-brand text-on-solid" : "border-line-strong bg-surface hover:bg-surface-2")}
                    >
                      {u.dirty && <span aria-label={t("rooms.status.dirty")} title={t("rooms.status.dirty")} className="mr-1.5 inline-block h-2 w-2 rounded-full bg-warn align-middle" />}
                      {u.label}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
      </Card>
      )}

      {/* 3 · Payment */}
      {shown < 3 ? (
        <FoldedStep n={3} title={t("stay.payment")} onOpen={() => reach(3)} />
      ) : (
      <Card>
        <Step n={3} title={t("stay.payment")} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("checkin.advance")}>
              <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder={total ? String(total / 100) : "0"} />
            </Field>
            <Field label={t("checkin.deposit")}>
              <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field group label={t("checkin.mode")}>
            <ChoiceChips value={mode} onChange={setMode} options={paymentModes.map((m) => ({ value: m, label: m.toUpperCase() }))} />
          </Field>
          {consentRequired && (
            <label className="flex gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t("checkin.consent")}</span>
            </label>
          )}
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>{t("checkin.whatsappOptIn")}</span>
          </label>
        </div>
      </Card>
      )}
        </div>
      </div>

      {/* Sticky total + submit: always within thumb reach. A laptop shows the same summary beside the form instead. */}
      <div className="fixed inset-x-0 bottom-[58px] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60 lg:hidden">
        <div className="mx-auto max-w-3xl md:px-4">
          {hint && <div className="mb-1.5">{hint}</div>}
          <div className="flex items-center gap-3">{totalBlock}{submitButton}</div>
        </div>
      </div>
    </div>
  )
}
