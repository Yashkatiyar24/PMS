"use client"

/**
 * Walk-in check-in (PRD Flow A). The target is under 60 seconds from first tap to receipt, so everything is
 * on one screen in the order the desk actually asks: who, how many, which bed, what did they pay.
 *
 * Nothing here blocks on the network. If the phone is offline the whole check-in is stored on the device
 * with a client id and replayed later; the desk sees it saved either way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, Search } from "lucide-react"
import { api, ApiError, newClientUuid, QueuedOffline, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { rupees, toPaise } from "@/lib/format"
import type { Booking, Guest, Room, RoomType } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Field, Loading } from "@/components/ui"

type Settings = Record<string, unknown>

export default function CheckInPage() {
  const { t } = useI18n()
  const router = useRouter()
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
  const [unitKey, setUnitKey] = useState("")
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
    void (async () => {
      const [s, r, ty] = await Promise.all([
        api<Settings>("/api/settings"),
        api<Room[]>("/api/rooms"),
        api<RoomType[]>("/api/room-types"),
      ])
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
        for (const bed of room.beds.filter((b) => b.active)) {
          entries.push({ label: `${room.number}/${bed.label}`, key: `${room.id}:${bed.id}`, ratePaise: type.baseRatePaise })
        }
      } else {
        entries.push({ label: room.number, key: `${room.id}:`, ratePaise: type.baseRatePaise })
      }
      byType.set(type.name, entries)
    }
    return byType
  }, [rooms, types])

  const chosenRate = useMemo(() => {
    for (const entries of options.values()) {
      const found = entries.find((e) => e.key === unitKey)
      if (found) return found.ratePaise
    }
    return 0
  }, [options, unitKey])

  const lookup = useCallback(async () => {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 4) return
    try {
      const found = await api<Guest[]>(`/api/guests?phone=${encodeURIComponent(digits)}`)
      setMatches(found)
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
    const maxKb = Number(settings?.id_photo_max_kb ?? 300)
    setPhoto(await compressImage(file, maxKb))
  }

  const photoRequired = Boolean(settings?.id_photo_required)
  const consentRequired = Boolean(settings?.consent_required)
  const canSubmit =
    !!name.trim() &&
    !!unitKey &&
    (!consentRequired || consent) &&
    (!photoRequired || !!photo || !!skipReason.trim())

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
          newGuest: guestId
            ? null
            : { name: name.trim(), phone, city, address, nationality: "IN", idType, idLast4, notes: "" },
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

  if (!settings) return <Loading />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("action.checkIn")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="info">{notice}</Banner>}

      <Card className="space-y-3">
        <Field label={t("checkin.phoneLookup")} hint={t("checkin.phoneHint")}>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setGuestId(null) }}
              onBlur={lookup}
              placeholder="9876543210"
            />
            <Button variant="secondary" onClick={lookup} aria-label={t("action.search")}>
              <Search size={18} aria-hidden />
            </Button>
          </div>
        </Field>

        {matches.length > 0 && (
          <ul className="space-y-1">
            {matches.map((guest) => (
              <li key={guest.id}>
                <button
                  onClick={() => applyExistingGuest(guest)}
                  className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-left"
                >
                  <span className="font-semibold">{guest.name}</span>
                  <span className="ml-2 text-sm text-[var(--color-ink-soft)]">{guest.city}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Field label={t("checkin.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        {guestId && <Chip tone="ok">{t("checkin.guest")} ✓</Chip>}

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("checkin.city")}>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t("checkin.idType")}>
            <select value={idType} onChange={(e) => setIdType(e.target.value)}>
              <option value="aadhaar">Aadhaar</option>
              <option value="voter">Voter ID</option>
              <option value="dl">Driving licence</option>
              <option value="passport">Passport</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>

        <Field label={t("checkin.idLast4")} hint={t("checkin.idLast4Hint")}>
          <input value={idLast4} maxLength={4} onChange={(e) => setIdLast4(e.target.value)} />
        </Field>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <Camera size={18} aria-hidden /> {t("checkin.takePhoto")}
            </Button>
            {photo && <Chip tone="ok">{Math.round(photo.size / 1024)} KB ✓</Chip>}
          </div>
          {photoRequired && !photo && (
            <div className="mt-2">
              <Field label={t("checkin.skipReason")}>
                <input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("checkin.adults")}>
            <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </Field>
          <Field label={t("checkin.children")}>
            <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </Field>
          <Field label={t("checkin.nights")}>
            <input type="number" min={1} value={nights} onChange={(e) => setNights(Number(e.target.value))} />
          </Field>
        </div>

        <Field label={t("checkin.pickRoom")}>
          <select value={unitKey} onChange={(e) => setUnitKey(e.target.value)}>
            <option value="">—</option>
            {[...options.entries()].map(([typeName, entries]) => (
              <optgroup key={typeName} label={`${typeName} · ${rupees(entries[0]?.ratePaise ?? 0)}`}>
                {entries.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {chosenRate > 0 && (
          <p className="text-sm text-[var(--color-ink-soft)]">
            {rupees(chosenRate)} × {nights} = <b>{rupees(chosenRate * nights)}</b>
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("checkin.advance")}>
            <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("checkin.deposit")}>
            <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
          </Field>
        </div>
        <Field label={t("checkin.mode")}>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {((settings.payment_modes as string[]) ?? ["cash"]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="space-y-2">
        {consentRequired && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("checkin.consent")}</span>
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span>{t("checkin.whatsappOptIn")}</span>
        </label>
      </Card>

      <Button className="w-full py-4 text-lg" disabled={!canSubmit || busy} onClick={submit}>
        <Check size={20} aria-hidden /> {t("checkin.submit")}
      </Button>
    </div>
  )
}
