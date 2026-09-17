"use client"

/**
 * Walk-in check-in (PRD Flow A). The target is under 60 seconds from first tap to receipt, so everything is
 * on one screen in the order the desk actually asks: who, which bed, what did they pay. The register's
 * extra questions (address, ID, photo) fold away until the desk needs them.
 *
 * Nothing here blocks on the network. If the phone is offline the whole check-in is stored on the device
 * with a client id and replayed later; the desk sees it saved either way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera, Check, Search } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError, newClientUuid, QueuedOffline, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { rupees, toPaise } from "@/lib/format"
import type { Booking, Guest, Room, RoomType } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, ChoiceChips, Disclosure, Field, Loading, PageHeader, Stepper } from "@/components/ui"
import { SelfRegistrationQr, type Submission } from "@/components/SelfRegistrationQr"

type Settings = Record<string, unknown>

const ID_TYPES = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "voter", label: "Voter ID" },
  { value: "dl", label: "Driving licence" },
  { value: "passport", label: "Passport" },
  { value: "other", label: "Other" },
]

/** Numbered section header: the desk reads the screen top to bottom, in this order. */
function Step({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 font-semibold">
      <span className={clsx("grid h-6 w-6 place-items-center rounded-full text-xs font-bold", done ? "bg-ok text-white" : "bg-brand-soft text-brand-ink")}>
        {done ? <Check size={14} aria-hidden /> : n}
      </span>
      {title}
    </h2>
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

  /** Free units for tonight, grouped by type, with the rate the desk will charge. */
  const options = useMemo(() => {
    const byType = new Map<string, { label: string; key: string; ratePaise: number }[]>()
    for (const room of rooms) {
      if (!room.active || room.status === "blocked") continue
      const type = types.find((x) => x.id === room.roomTypeId)
      if (!type) continue
      const entries = byType.get(type.name) ?? []
      if (type.dormitory) {
        for (const bed of room.beds.filter((b) => b.active)) entries.push({ label: `${room.number}/${bed.label}`, key: `${room.id}:${bed.id}`, ratePaise: type.baseRatePaise })
      } else {
        entries.push({ label: room.number, key: `${room.id}:`, ratePaise: type.baseRatePaise })
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
  const canSubmit = !!name.trim() && !!unitKey && (!consentRequired || consent) && (!photoRequired || !!photo || !!skipReason.trim())

  async function submit() {
    setBusy(true)
    setError("")
    const [roomId, bedId] = unitKey.split(":")
    const clientUuid = newClientUuid()
    try {
      // A photo needs a guest row to hang on, so an existing guest gets theirs uploaded first.
      const uploadedFor = guestId
      if (photo && uploadedFor) await upload(`/api/guests/${uploadedFor}/id-photo`, photo, "id.jpg")

      const booking = await api<Booking>("/api/bookings/check-in", {
        method: "POST",
        clientUuid,
        queueWhenOffline: true,
        body: {
          guestId,
          newGuest: guestId ? null : { name: name.trim(), phone, city, address, nationality: "IN", idType, idLast4, notes: "" },
          units: [{ roomId, bedId: bedId || null, ratePaise: null }],
          nights,
          adults,
          children,
          members: null,
          purpose: "pilgrimage",
          notes: "",
          consent,
          whatsappOptIn: optIn,
          idPhotoSkippedReason: photo ? null : skipReason.trim() || null,
          advancePaise: toPaise(advance),
          advanceMode: mode,
          depositPaise: toPaise(deposit),
        },
      })

      // A new guest only gets an id once the server replies, so their photo is uploaded now.
      if (photo && !uploadedFor) await upload(`/api/guests/${booking.guestId}/id-photo`, photo, "id.jpg")

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

  /** The guest pressed send on their own phone: their answers fill this form for the desk to read back. */
  const applySelfRegistration = useCallback((sub: Submission) => {
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
    setNotice(t("selfreg.received", { name: sub.name }))
  }, [t])

  if (!settings) return <Loading />

  const paymentModes = (settings.payment_modes as string[]) ?? ["cash"]
  const total = chosenRate * nights

  return (
    <div className="space-y-4 pb-24">
      <PageHeader title={t("action.checkIn")} back="/" />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {notice && <Banner tone="info" onClose={() => setNotice("")}>{notice}</Banner>}

      {Boolean(settings.self_registration_enabled) && <SelfRegistrationQr onReceived={applySelfRegistration} />}

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
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            {guestId && <Chip tone="ok" className="mb-3">{t("checkin.guest")} ✓</Chip>}
          </div>
          <Field label={t("checkin.city")}>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Disclosure
        title={t("checkin.moreDetails")}
        summary={[ID_TYPES.find((i) => i.value === idType)?.label, idLast4 && `••${idLast4}`, photo && `${Math.round(photo.size / 1024)} KB ✓`].filter(Boolean).join(" · ") || undefined}
        defaultOpen={photoRequired}
      >
        <div className="space-y-3">
          <Field label={t("checkin.idType")}>
            <ChoiceChips value={idType} onChange={setIdType} options={ID_TYPES} />
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
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <Camera size={18} aria-hidden /> {t("checkin.takePhoto")}
            </Button>
            {photo && <Chip tone="ok">{Math.round(photo.size / 1024)} KB ✓</Chip>}
          </div>
          {photoRequired && !photo && (
            <Field label={t("checkin.skipReason")}>
              <input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
            </Field>
          )}
        </div>
      </Disclosure>

      {/* 2 · Room */}
      <Card>
        <Step n={2} title={t("checkin.stepRoom")} done={!!unitKey} />
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stepper label={t("checkin.adults")} value={adults} min={1} onChange={setAdults} />
            <Stepper label={t("checkin.children")} value={children} onChange={setChildren} />
            <Stepper label={t("checkin.nights")} value={nights} min={1} onChange={setNights} />
          </div>

          <Field label={t("booking.roomType")}>
            <ChoiceChips
              value={activeType}
              onChange={(v) => { setTypeName(v); setUnitKey("") }}
              options={[...options.entries()].map(([name, es]) => ({ value: name, label: `${name} · ${rupees(es[0]?.ratePaise ?? 0)}` }))}
            />
          </Field>

          <Field label={t("checkin.pickRoom")}>
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
                      onClick={() => setUnitKey(u.key)}
                      className={clsx("min-h-[44px] min-w-[64px] rounded-xl border px-3 text-[15px] font-bold tabular-nums transition-colors", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:bg-surface-2")}
                    >
                      {u.label}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
      </Card>

      {/* 3 · Payment */}
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
          <Field label={t("checkin.mode")}>
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

      {/* Sticky total + submit: always within thumb reach. */}
      <div className="fixed inset-x-0 bottom-[58px] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3 md:px-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-soft">{t("checkin.total")}</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{rupees(total)} <span className="text-xs font-normal text-ink-soft">{chosenRate > 0 && `${rupees(chosenRate)} × ${nights}`}</span></p>
          </div>
          <Button size="lg" className="min-w-[45%]" disabled={!canSubmit || busy} onClick={submit}>
            <Check size={20} aria-hidden /> {t("checkin.submit")}
          </Button>
        </div>
      </div>
    </div>
  )
}
