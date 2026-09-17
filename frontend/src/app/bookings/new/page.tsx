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
import { Banner, Button, Card, Chip, ChoiceChips, Disclosure, Field, Loading, PageHeader, Stepper } from "@/components/ui"

type Settings = Record<string, unknown>

export default function NewBookingPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()

  const { data } = useResource(
    async () => {
      const [settings, rooms, types] = await Promise.all([api<Settings>("/api/settings"), api<Room[]>("/api/rooms"), api<RoomType[]>("/api/room-types")])
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

  // The type follows a preselected unit (from the tape chart), else the first type listed.
  const roomTypeId = chosenTypeId || (unitKey && data?.rooms.find((r) => r.id === unitKey.split(":")[0])?.roomTypeId) || data?.types[0]?.id || ""

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
  const nights = arrive && depart ? Math.max(0, Math.round((new Date(depart).getTime() - new Date(arrive).getTime()) / 86_400_000)) : 0
  const type = data?.types.find((x) => x.id === roomTypeId)
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
      <PageHeader title={t("booking.new")} back="/bookings" />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Card title={t("checkin.guest")}>
        <div className="space-y-3">
          <Field label={t("checkin.phoneLookup")} hint={t("checkin.phoneHint")}>
            <input inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value); setGuestId(null) }} onBlur={lookup} placeholder="9876543210" />
          </Field>
          {matches.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-line divide-y divide-line">
              {matches.map((guest) => (
                <li key={guest.id}>
                  <button onClick={() => { setGuestId(guest.id); setName(guest.name); setCity(guest.city); setMatches([]) }} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="font-semibold">{guest.name}</span>
                    <span className="text-sm text-ink-soft">{guest.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("checkin.name")}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("checkin.city")}>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
          </div>
          {guestId && <Chip tone="ok">{t("checkin.guest")} ✓</Chip>}
        </div>
      </Card>

      <Card title={t("checkin.stepRoom")} action={nights > 0 && type ? <Chip tone="brand">{nights} × {rupees(type.baseRatePaise)} = {rupees(nights * type.baseRatePaise)}</Chip> : undefined}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("booking.arrival")}>
              <input type="date" value={arrive} onChange={(e) => setArrive(e.target.value)} />
            </Field>
            <Field label={t("booking.departure")}>
              <input type="date" value={depart} min={arrive || undefined} onChange={(e) => setDepart(e.target.value)} />
            </Field>
          </div>
          <Field label={t("booking.roomType")}>
            <ChoiceChips
              value={roomTypeId}
              onChange={(v) => { setChosenTypeId(v); setUnitKey("") }}
              options={data.types.map((ty) => ({ value: ty.id, label: `${ty.name} · ${rupees(ty.baseRatePaise)}` }))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Stepper label={t("checkin.adults")} value={adults} min={1} onChange={setAdults} />
            <Stepper label={t("checkin.children")} value={children} onChange={setChildren} />
          </div>
        </div>
      </Card>

      <Disclosure title={t("booking.specificUnit")} summary={unitKey ? units.find((u) => u.key === unitKey)?.label : t("booking.anyRoom")} defaultOpen={!!unitKey}>
        <select value={unitKey} onChange={(e) => setUnitKey(e.target.value)}>
          <option value="">{t("booking.anyRoom")}</option>
          {units.map((unit) => (
            <option key={unit.key} value={unit.key}>{unit.label}</option>
          ))}
        </select>
      </Disclosure>

      <Card title={t("checkin.advance")}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("checkin.advance")}>
              <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
            </Field>
            <Field label={t("checkin.mode")}>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {((settings?.payment_modes as string[]) ?? ["upi", "cash"]).map((m) => (
                  <option key={m} value={m}>{m.toUpperCase()}</option>
                ))}
              </select>
            </Field>
          </div>
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

      <Button size="lg" className="w-full" disabled={!canSubmit || busy} onClick={submit}>
        <CalendarCheck size={20} aria-hidden /> {t("booking.create")}
      </Button>
    </div>
  )
}
