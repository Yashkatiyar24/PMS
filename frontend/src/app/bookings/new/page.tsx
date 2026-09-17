"use client"

/**
 * Advance booking over the phone (PRD Flow C).
 *
 * The manager usually knows the dates and the kind of room, not which room. Leaving the room unchosen is
 * the normal case: the server holds a free unit of that type so the exclusion constraint still protects it,
 * and the desk can move the guest later. A specific room or bed can be picked when the tape chart sent us
 * here with one already in mind.
 */
import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CalendarCheck } from "lucide-react"
import { api, ApiError, newClientUuid } from "@/lib/api"
import { rupees, toPaise } from "@/lib/format"
import type { Booking, Guest, Room, RoomType } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Field, Loading } from "@/components/ui"

type Settings = Record<string, unknown>

export default function NewBookingPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()

  const { data } = useResource(
    async () => {
      const [settings, rooms, types] = await Promise.all([
        api<Settings>("/api/settings"),
        api<Room[]>("/api/rooms"),
        api<RoomType[]>("/api/room-types"),
      ])
      return { settings, rooms, types }
    },
    [],
    t("error.generic"),
  )

  const [phone, setPhone] = useState("")
  const [matches, setMatches] = useState<Guest[]>([])
  const [guestId, setGuestId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [city, setCity] = useState("")

  const [arrive, setArrive] = useState(search.get("date") ?? "")
  const [depart, setDepart] = useState("")
  // Empty means "whatever the property lists first"; derived rather than copied into state in an effect.
  const [chosenTypeId, setChosenTypeId] = useState("")
  const [unitKey, setUnitKey] = useState(search.get("room") ? `${search.get("room")}:${search.get("bed") ?? ""}` : "")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [advance, setAdvance] = useState("")
  const [mode, setMode] = useState("upi")
  const [optIn, setOptIn] = useState(true)
  const [consent, setConsent] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const roomTypeId = chosenTypeId || data?.types[0]?.id || ""

  /** Units of the chosen type, offered when the manager wants a particular room. */
  const units = useMemo(() => {
    if (!data) return []
    return data.rooms
      .filter((room) => room.active && room.status !== "blocked" && (!roomTypeId || room.roomTypeId === roomTypeId))
      .flatMap((room) =>
        room.beds.length > 0
          ? room.beds.filter((b) => b.active).map((bed) => ({ key: `${room.id}:${bed.id}`, label: `${room.number}/${bed.label}` }))
          : [{ key: `${room.id}:`, label: room.number }],
      )
  }, [data, roomTypeId])

  async function lookup() {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 4) return
    try {
      setMatches(await api<Guest[]>(`/api/guests?phone=${encodeURIComponent(digits)}`))
    } catch {
      setMatches([])
    }
  }

  const settings = data?.settings
  const consentRequired = Boolean(settings?.consent_required)
  const checkinTime = String(settings?.checkin_time ?? "12:00")
  const checkoutTime = String(settings?.checkout_time ?? "10:00")
  const canSubmit = !!name.trim() && !!arrive && !!depart && depart > arrive && (!consentRequired || consent)

  async function submit() {
    setBusy(true)
    setError("")
    const [roomId, bedId] = unitKey ? unitKey.split(":") : []
    try {
      const booking = await api<Booking>("/api/bookings/reserve", {
        method: "POST",
        clientUuid: newClientUuid(),
        queueWhenOffline: false, // a reservation is taken on the phone, where there is a line anyway
        body: {
          guestId,
          newGuest: guestId ? null : { name: name.trim(), phone, city, address: "", nationality: "IN", idType: null, idLast4: null, notes: "" },
          roomTypeId: unitKey ? null : roomTypeId,
          units: unitKey ? [{ roomId, bedId: bedId || null, ratePaise: null }] : null,
          // Local wall-clock times at the property, sent with the browser's offset.
          arriveAt: new Date(`${arrive}T${checkinTime}`).toISOString(),
          departAt: new Date(`${depart}T${checkoutTime}`).toISOString(),
          adults,
          children,
          purpose: "pilgrimage",
          notes: "",
          consent,
          whatsappOptIn: optIn,
          advancePaise: toPaise(advance),
          advanceMode: mode,
        },
      })
      router.push(`/stays/${booking.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Loading />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("booking.new")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <Card className="space-y-3">
        <Field label={t("checkin.phoneLookup")} hint={t("checkin.phoneHint")}>
          <input
            inputMode="numeric"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setGuestId(null) }}
            onBlur={lookup}
            placeholder="9876543210"
          />
        </Field>

        {matches.length > 0 && (
          <ul className="space-y-1">
            {matches.map((guest) => (
              <li key={guest.id}>
                <button
                  onClick={() => { setGuestId(guest.id); setName(guest.name); setCity(guest.city); setMatches([]) }}
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
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {guestId && <Chip tone="ok">{t("checkin.guest")} ✓</Chip>}
        <Field label={t("checkin.city")}>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("booking.arrival")}>
            <input type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} />
          </Field>
          <Field label={t("booking.departure")}>
            <input type="date" value={depart} min={arrive || undefined} onChange={(e) => setDepart(e.target.value)} />
          </Field>
        </div>

        <Field label={t("booking.roomType")}>
          <select value={roomTypeId} onChange={(e) => { setChosenTypeId(e.target.value); setUnitKey("") }}>
            {data.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} · {rupees(type.baseRatePaise)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("booking.specificUnit")}>
          <select value={unitKey} onChange={(e) => setUnitKey(e.target.value)}>
            <option value="">{t("booking.anyRoom")}</option>
            {units.map((unit) => (
              <option key={unit.key} value={unit.key}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("checkin.adults")}>
            <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </Field>
          <Field label={t("checkin.children")}>
            <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("checkin.advance")}>
            <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("checkin.mode")}>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {((settings?.payment_modes as string[]) ?? ["upi", "cash"]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
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
        <CalendarCheck size={20} aria-hidden /> {t("booking.create")}
      </Button>
    </div>
  )
}
