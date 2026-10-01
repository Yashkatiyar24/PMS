"use client"

/**
 * Walk-in check-in (PRD Flow A). The target is under 60 seconds from first tap to receipt, so it is one
 * screen in the order the desk actually asks: who, which bed, what did they pay. All three steps sit open
 * top to bottom, so nothing needs a tap to appear. The register's extra questions (address, ID,
 * photo) fold away until the desk needs them.
 *
 * The guest's half of this form is not a copy of the guest's phone screen: it is the same check-in session,
 * read and written through `useCheckInSession`. What the guest types appears here within a couple of seconds
 * and what the clerk corrects here appears on the guest's phone, because there is one draft on one row and
 * both screens name their fields from `checkin-fields.ts`. Nobody reloads anything.
 *
 * Nothing here blocks on the network. If the phone is offline the whole check-in is stored on the device
 * with a client id and replayed later; the desk sees it saved either way, and the draft it could not reach
 * goes out with the next poll.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera, Check, Search } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError, newClientUuid, QueuedOffline, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { readIdFromPhoto } from "@/lib/ocr"
import { type FieldName, ID_TYPES, toGuestInput } from "@/lib/checkin-fields"
import { useCheckInSession } from "@/lib/useCheckInSession"
import { useResource } from "@/lib/use-resource"
import { rupees, toPaise, unitName } from "@/lib/format"
import { OFF_SALE, type Booking, type Guest, type Room, type RoomType } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, ChoiceChips, Disclosure, Field, Loading, PageHeader, Stepper } from "@/components/ui"
import { SelfRegistrationQr, type Registration } from "@/components/SelfRegistrationQr"
import { OcrSuggestion } from "@/components/OcrSuggestion"

type Settings = Record<string, unknown>

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

export default function CheckInPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()
  const started = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /**
   * What the screen needs before it can draw: the property's settings, its rooms and their types. Loaded
   * through the shared resource hook, so a server that is slow, asleep or down ends in a message with a retry
   * rather than a skeleton that never resolves.
   */
  const { data: setup, error: loadError, reload } = useResource(
    async () => {
      const [settings, rooms, types] = await Promise.all([
        api<Settings>("/api/settings"), api<Room[]>("/api/rooms"), api<RoomType[]>("/api/room-types"),
      ])
      return { settings, rooms, types }
    },
    [],
    t("error.generic"),
  )
  const settings = setup?.settings
  const rooms = useMemo(() => setup?.rooms ?? [], [setup])
  const types = useMemo(() => setup?.types ?? [], [setup])

  // The check-in session the QR code points at. Everything the guest answers lives in it, on the server, so
  // this screen can be reloaded without losing a word of it.
  const [regId, setRegId] = useState<string | null>(null)
  const transport = useMemo(() => ({
    read: async () => (regId ? view(await api<Registration>(`/api/registrations/${regId}`)) : null),
    write: async (patch: object) => view(await api<Registration>(`/api/registrations/${regId}`, { method: "PATCH", body: patch })),
  }), [regId])
  const live = useCheckInSession(transport, { enabled: !!regId })
  const { draft, set, setMany, ocr, recent, connected, status } = live
  /** The guest's answers as text, for an input's value. */
  const v = useCallback((field: FieldName) => String(draft[field] ?? ""), [draft])
  // The register wants an ID type named, so the desk's chips start where they always did rather than blank.
  // Written into the session only if the clerk picks something, so it never overrules the guest's own answer.
  const idType = v("idType") || "voter"

  const [guestId, setGuestId] = useState<string | null>(null)
  const [matches, setMatches] = useState<Guest[]>([])
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [skipReason, setSkipReason] = useState("")

  const [typeName, setTypeName] = useState("")
  const [unitKey, setUnitKey] = useState(search.get("room") ? `${search.get("room")}:${search.get("bed") ?? ""}` : "")
  const [nights, setNights] = useState(1)
  const [advance, setAdvance] = useState("")
  // Null until the desk types: the property's own default stands in, without an effect that would set state
  // the moment the settings land and render the screen twice.
  const [deposit, setDeposit] = useState<string | null>(null)
  const [mode, setMode] = useState<string | null>(null)
  const depositValue = deposit ?? String(Number(settings?.deposit_default_paise ?? 0) / 100 || "")
  const modeValue = mode ?? (settings?.payment_modes as string[] | undefined)?.[0] ?? "cash"

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => { started.current = Date.now() }, [])

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
      // A retired room type is left out, exactly as the availability query leaves it out: offering a room the
      // tape chart does not believe is free is how a desk ends up with a booking nobody can see.
      if (!type || !type.active) continue
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
    const digits = v("phone").replace(/\D/g, "")
    if (digits.length < 4) return
    try {
      setMatches(await api<Guest[]>(`/api/guests?phone=${encodeURIComponent(digits)}`))
    } catch {
      setMatches([])
    }
  }, [v])

  /** An existing guest the desk recognised: their record fills the draft, so the guest's phone shows it too. */
  function applyExistingGuest(guest: Guest) {
    setGuestId(guest.id)
    setMany({
      name: guest.name, phone: guest.phone, city: guest.city, address: guest.address,
      state: guest.state, country: guest.country, email: guest.email ?? "",
      nationality: guest.nationality, idType: guest.idType ?? "", idLast4: guest.idLast4 ?? "",
    }, true)
    setMatches([])
  }

  /**
   * The desk photographing the ID at the counter. The reading happens on this device — the image never goes
   * anywhere for it — and what it finds is offered to the session as suggestions: empty fields take them, and
   * a field somebody already typed keeps what they typed with the suggestion shown beside it.
   */
  async function pickPhoto(file: File) {
    const compressed = await compressImage(file, Number(settings?.id_photo_max_kb ?? 300))
    setPhoto(compressed)
    if (regId) live.setStatus("reading_id")
    const read = await readIdFromPhoto(compressed)
    if (read) {
      live.pushOcr(read)
      setNotice(t("ocr.read"))
    } else {
      setNotice(t("ocr.failed"))
      if (regId) live.setStatus("filling")
    }
  }

  const photoRequired = Boolean(settings?.id_photo_required)
  const consentRequired = Boolean(settings?.consent_required)
  const consent = Boolean(draft.consent)
  // The guest photographing their own ID is the one thing this screen cannot read out of the draft.
  const guestPhoto = Boolean(live.session?.hasIdPhoto)
  // What still stands between the desk and the receipt, in the order the screen asks. Shown beside the button,
  // because a greyed-out button with no reason reads as broken.
  const missing = !v("name").trim() ? t("checkin.need.name")
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
    // One canonical guest, built from the one draft both screens have been writing into.
    const newGuest = { ...toGuestInput(draft), idType }
    try {
      // Anything typed in the last half second has not been sent yet; it goes before the check-in does.
      if (regId) await live.flush()
      let guest = guestId
      // The session's details become the guest record, their ID photo included, with whatever the desk
      // corrected on screen. Remembered, so a check-in the server refuses is not applied twice on retry.
      // Offline, the plain path below still queues the check-in; only the guest's photo is left behind.
      if (!guest && regId) {
        try {
          guest = (await api<{ guestId: string }>(`/api/registrations/${regId}/apply`, { method: "POST", body: newGuest })).guestId
          setGuestId(guest)
        } catch (e) {
          if (!(e instanceof TypeError)) throw e
        }
      } else if (guest && regId) {
        // Already a guest — from a phone lookup, or from an earlier apply; this carries the corrections onto it.
        await api(`/api/guests/${guest}`, { method: "PUT", body: newGuest })
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
          adults: Number(draft.adults ?? 1),
          children: Number(draft.children ?? 0),
          members: (draft.members as { name: string; adult: boolean }[] | undefined) ?? null,
          purpose: String(draft.purpose ?? "pilgrimage"),
          notes: "",
          consent,
          whatsappOptIn: Boolean(draft.whatsappOptIn),
          idPhotoSkippedReason: photo || guestPhoto ? null : skipReason.trim() || null,
          advancePaise: toPaise(advance),
          advanceMode: modeValue,
          depositPaise: toPaise(depositValue),
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

  // A failed load is said out loud, with the one thing worth trying. The desk can still reach the rest of the
  // app from the rail; what it cannot do is check anybody in without knowing the rooms.
  if (loadError) return (
    <div className="space-y-4">
      <PageHeader title={t("action.checkIn")} back="/" />
      <Banner tone="danger">{loadError}</Banner>
      <Button onClick={reload}>{t("action.retry")}</Button>
    </div>
  )
  if (!settings) return <Loading />

  const paymentModes = (settings.payment_modes as string[]) ?? ["cash"]
  const total = chosenRate * nights
  const ocrLabels = { read: t("ocr.read"), verify: t("ocr.verify"), use: t("ocr.use") }

  /** A field of the shared draft: typed here, sent to the guest's phone, marked when it came from theirs. */
  const live_ = (field: FieldName, label: string, extra?: { hint?: string; maxLength?: number; inputMode?: "numeric" | "decimal" | "email"; type?: string }) => (
    <Field label={label} hint={extra?.hint}>
      <input
        value={v(field)}
        maxLength={extra?.maxLength}
        inputMode={extra?.inputMode}
        type={extra?.type}
        onChange={(e) => set(field, e.target.value)}
        className={clsx(recent.includes(field) && "anim-pop border-ok")}
      />
      <OcrSuggestion suggestion={ocr[field]} current={v(field)} onUse={() => live.accept(field)} labels={ocrLabels} />
      {recent.includes(field) && <p className="mt-1 text-xs font-medium text-ok">{t("selfreg.fromGuest")}</p>}
    </Field>
  )

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
      {/* Derived, not stored: the guest pressing save on their phone is a fact about the session, and a banner
          held in state here would survive a new code being shown. */}
      {status === "submitted" && !notice && <Banner tone="info">{t("selfreg.received", { name: v("name") })}</Banner>}

      {/* A phone reads top to bottom: the QR handover, then the steps, with the total pinned below. A laptop has
          room for the handover and the total to sit beside the form, so the desk sees the code and the form at once. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          {Boolean(settings.self_registration_enabled) && (
            <SelfRegistrationQr onLink={setRegId} status={status} connected={connected} />
          )}
          <Card className="hidden space-y-2 lg:block">{totalBlock}{hint}{submitButton}</Card>
        </aside>

        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
      {/* 1 · Guest */}
      <Card>
        <Step n={1} title={t("checkin.guest")} done={!!v("name").trim()} />
        <div className="space-y-3">
          <Field label={t("checkin.phoneLookup")}>
            <div className="flex gap-2">
              <input inputMode="numeric" value={v("phone")} onChange={(e) => { set("phone", e.target.value); setGuestId(null) }} onBlur={lookup} placeholder="9876543210" />
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
            <div className="min-w-0">{live_("name", t("checkin.name"))}</div>
            {guestId && <Chip tone="ok" className="mb-3">{t("checkin.guest")}</Chip>}
          </div>
        </div>
      </Card>

      <Disclosure
        title={t("checkin.moreDetails")}
        summary={[t(`id.${idType}` as "id.aadhaar"), v("idLast4") && `••${v("idLast4")}`, photo ? `${Math.round(photo.size / 1024)} KB` : guestPhoto && t("selfreg.photoReceived")].filter(Boolean).join(" · ") || undefined}
        defaultOpen={photoRequired || Object.keys(ocr).length > 0}
      >
        <div className="space-y-3">
          <Field group label={t("checkin.idType")}>
            <ChoiceChips value={idType} onChange={(value) => set("idType", value)} options={ID_TYPES.map((value) => ({ value, label: t(`id.${value}` as "id.aadhaar") }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {live_("idLast4", t("checkin.idLast4"), { hint: t("checkin.idLast4Hint"), maxLength: 4, inputMode: "numeric" })}
            {live_("address", t("checkin.address"))}
            {live_("city", t("checkin.city"))}
            {live_("state", t("setup.state"))}
            {live_("pincode", t("checkin.pincode"), { maxLength: 10, inputMode: "numeric" })}
            {live_("dob", t("checkin.dob"), { type: "date" })}
            {live_("email", t("setup.email"), { inputMode: "email" })}
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
      <Card>
        <Step n={2} title={t("checkin.stepRoom")} done={!!unitKey} />
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stepper label={t("checkin.adults")} value={Number(draft.adults ?? 1)} min={1} onChange={(n) => set("adults", n)} />
            <Stepper label={t("checkin.children")} value={Number(draft.children ?? 0)} onChange={(n) => set("children", n)} />
            <Stepper label={t("checkin.nights")} value={nights} min={1} onChange={setNights} />
          </div>

          <Field group label={t("booking.roomType")}>
            <ChoiceChips
              value={activeType}
              onChange={(value) => { setTypeName(value); setUnitKey("") }}
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
                      onClick={() => setUnitKey(u.key)}
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

      {/* 3 · Payment */}
      <Card>
        <Step n={3} title={t("stay.payment")} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("checkin.advance")}>
              <input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder={total ? String(total / 100) : "0"} />
            </Field>
            <Field label={t("checkin.deposit")}>
              <input inputMode="decimal" value={depositValue} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field group label={t("checkin.mode")}>
            <ChoiceChips value={modeValue} onChange={setMode} options={paymentModes.map((m) => ({ value: m, label: m.toUpperCase() }))} />
          </Field>
          {consentRequired && (
            <label className="flex gap-3 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => set("consent", e.target.checked)} />
              <span>{t("checkin.consent")}</span>
            </label>
          )}
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={Boolean(draft.whatsappOptIn)} onChange={(e) => set("whatsappOptIn", e.target.checked)} />
            <span>{t("checkin.whatsappOptIn")}</span>
          </label>
        </div>
      </Card>
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

/** The desk's registration row, as the shared session hook wants it. */
function view(reg: Registration) {
  return {
    state: reg.state, status: reg.status, version: reg.version,
    draft: reg.draft ?? {}, ocr: reg.ocr ?? {}, hasIdPhoto: reg.hasIdPhoto, expiresAt: reg.expiresAt,
  }
}
