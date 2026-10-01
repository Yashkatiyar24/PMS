"use client"

/**
 * The guest filling their own details, on their own phone, after scanning the QR at the desk.
 *
 * This is the register book, handed to the person it is about. Whoever opens it has no account, may never
 * have used the app before, and is standing in a queue — so it asks the fewest questions the register needs,
 * in their own language, one screen, with a single button at the end.
 *
 * It is not a second form. Every box here is a field of the same check-in session the clerk has open at the
 * desk (`useCheckInSession`, field list in `checkin-fields.ts`): what the guest types appears on the clerk's
 * screen a second or two later, what the clerk corrects appears here, and reloading this page brings back
 * everything already typed instead of an empty form.
 *
 * Nothing here is behind a login: the random token in the URL is the whole credential. Saving stores what
 * was typed for the desk to look at; it does not create a guest, a booking or a charge on its own. The desk
 * completes the check-in, which is why the button says save and not submit.
 */
import { compressImage } from "@/lib/image"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { Camera, Check, Loader, Plus, X } from "lucide-react"
import { getForm, getSession, patchSession, PublicApiError, submitForm, uploadPhoto } from "@/lib/public-api"
import { readIdFromPhoto } from "@/lib/ocr"
import { type FieldName, type Member, type Patch } from "@/lib/checkin-fields"
import { useCheckInSession } from "@/lib/useCheckInSession"
import { OcrSuggestion } from "@/components/OcrSuggestion"
import { Banner, Button, Card, Field, Loading, Stepper } from "@/components/ui"

type Form = {
  propertyName: string
  language: "hi" | "en"
  askPhoto: boolean
  askConsent: boolean
  consentText: string
  alreadyDone: boolean
}

/** The guest's phone may be set to either language, so this screen carries its own strings. */
const TEXT = {
  hi: {
    title: "अपनी जानकारी भरें",
    lead: "यह जानकारी अतिथि रजिस्टर के लिए है। जो आप भरेंगे वह रिसेप्शन की स्क्रीन पर साथ-साथ दिखता रहेगा।",
    name: "पूरा नाम", city: "शहर या गाँव", address: "पता", phone: "मोबाइल नंबर",
    email: "ईमेल", dob: "जन्म तिथि", state: "राज्य", pincode: "पिन कोड",
    nationality: "राष्ट्रीयता", indian: "भारतीय", foreign: "विदेशी", passport: "पासपोर्ट नंबर",
    idType: "पहचान पत्र", idLast4: "पहचान पत्र के आखिरी 4 अंक",
    idHint: "पूरा आधार नंबर न लिखें, केवल आखिरी 4 अंक",
    photo: "पहचान पत्र की फोटो", takePhoto: "फोटो लें", photoDone: "फोटो भेज दी गई",
    reading: "फोटो पढ़ी जा रही है…", readDone: "फोटो से जानकारी भर दी गई — जाँच लें",
    readFailed: "फोटो पढ़ी नहीं जा सकी। जानकारी हाथ से भरें।",
    ocrRead: "फ़ोटो से पढ़ा", ocrVerify: "फ़ोटो से पढ़ा — जाँच लें", ocrUse: "यही लें",
    adults: "बड़े", children: "बच्चे", members: "साथ के लोग", memberName: "नाम",
    addMember: "और जोड़ें", remove: "हटाएं",
    whatsapp: "मुझे व्हाट्सएप पर रसीद भेजें",
    submit: "सेव करें", sending: "सेव हो रहा है…",
    doneTitle: "सेव हो गया", doneBody: "आपकी जानकारी रिसेप्शन तक पहुँच गई है। चेक-इन वहीं पूरा होगा।",
    expired: "यह लिंक अब काम नहीं करता। रिसेप्शन से नया QR कोड मांगें।",
    failed: "कुछ गड़बड़ हुई। फिर कोशिश करें।",
    required: "कृपया नाम भरें",
    offline: "इंटरनेट से दोबारा जुड़ रहे हैं… आपकी जानकारी सुरक्षित है।",
    deskEdited: "रिसेप्शन ने कुछ जानकारी ठीक की है।",
  },
  en: {
    title: "Fill in your details",
    lead: "These details are for the guest register. What you fill in shows up on the reception screen as you type.",
    name: "Full name", city: "City or village", address: "Address", phone: "Mobile number",
    email: "Email", dob: "Date of birth", state: "State", pincode: "PIN code",
    nationality: "Nationality", indian: "Indian", foreign: "Foreign", passport: "Passport number",
    idType: "ID type", idLast4: "Last 4 digits of ID",
    idHint: "Do not write the full Aadhaar number, only the last 4 digits",
    photo: "Photo of your ID", takePhoto: "Take photo", photoDone: "Photo sent",
    reading: "Reading the photo…", readDone: "Filled in from the photo — please check",
    readFailed: "Could not read that photo. Please fill the details in yourself.",
    ocrRead: "Read from the photo", ocrVerify: "Read from the photo — please check", ocrUse: "Use this",
    adults: "Adults", children: "Children", members: "People with you", memberName: "Name",
    addMember: "Add another", remove: "Remove",
    whatsapp: "Send me the receipt on WhatsApp",
    submit: "Save", sending: "Saving…",
    doneTitle: "Saved", doneBody: "The desk has your details and will complete your check-in there.",
    expired: "This link no longer works. Please ask the desk for a new QR code.",
    failed: "Something went wrong. Please try again.",
    required: "Please fill in your name",
    offline: "Reconnecting… nothing you typed is lost.",
    deskEdited: "The desk has corrected some of your details.",
  },
} as const

const ID_TYPES = [
  { value: "aadhaar", hi: "आधार", en: "Aadhaar" },
  { value: "voter", hi: "वोटर आईडी", en: "Voter ID" },
  { value: "dl", hi: "ड्राइविंग लाइसेंस", en: "Driving licence" },
  { value: "pan", hi: "पैन कार्ड", en: "PAN card" },
  { value: "passport", hi: "पासपोर्ट", en: "Passport" },
  { value: "other", hi: "अन्य", en: "Other" },
]

export default function GuestRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [form, setForm] = useState<Form | null>(null)
  const [gone, setGone] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [photoSent, setPhotoSent] = useState(false)
  const [readNote, setReadNote] = useState<string | null>(null)

  // The same session the desk is looking at. Everything typed below goes into it field by field.
  const transport = useMemo(() => ({
    read: () => getSession(token),
    write: (patch: Patch) => patchSession(token, patch),
  }), [token])
  const live = useCheckInSession(transport, { enabled: !gone && !done })
  const { draft, set, setMany, ocr, recent, connected } = live

  useEffect(() => {
    let alive = true
    getForm<Form>(token)
      .then((f) => {
        if (!alive) return
        setForm(f)
        if (f.alreadyDone) setDone(true)
      })
      .catch(() => alive && setGone(true))
    return () => { alive = false }
  }, [token])

  const language = form?.language ?? "hi"
  const t = TEXT[language]
  const value = useCallback((field: FieldName) => String(draft[field] ?? ""), [draft])
  const members = (draft.members as Member[] | undefined) ?? []
  const foreign = value("nationality") !== "" && value("nationality") !== "IN"

  /**
   * The guest photographing their own ID. The photo goes to the property's storage; the reading happens here
   * on the phone, so the card's full number never travels. What it finds fills the boxes still empty and is
   * offered beside the boxes already filled — including on the clerk's screen, within a second or two.
   */
  const takePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setError(null)
      setReadNote(null)
      try {
        // Re-encoded on the phone: small enough to send, and without the camera's location and device tags.
        const image = await compressImage(file, 300)
        await uploadPhoto(token, image)
        setPhotoSent(true)
        setReading(true)
        live.setStatus("reading_id")
        const read = await readIdFromPhoto(image)
        if (read) {
          live.pushOcr(read)
          setReadNote(t.readDone)
        } else {
          setReadNote(t.readFailed)
        }
        live.setStatus("filling")
      } catch (e) {
        setError(e instanceof PublicApiError ? e.message : t.failed)
      } finally {
        setReading(false)
      }
    },
    [token, t.failed, t.readDone, t.readFailed, live],
  )

  /** Typing anything is what tells the desk the guest is working, rather than merely connected. */
  const write = useCallback((field: FieldName, v: string | number | boolean | Member[]) => {
    set(field, v)
    if (live.status === "opened" || live.status === "waiting") live.setStatus("filling")
  }, [set, live])

  async function send() {
    if (!value("name").trim()) return setError(t.required)
    setBusy(true)
    setError(null)
    try {
      await live.flush() // the last keystroke, before the form closes behind us
      await submitForm(token, {
        name: value("name"),
        phone: value("phone"),
        city: value("city"),
        address: value("address"),
        nationality: foreign ? "" : "IN",
        idType: value("idType") || "aadhaar",
        idLast4: value("idLast4"),
        passportNo: foreign ? value("passportNo") : null,
        adults: Number(draft.adults ?? 1),
        children: Number(draft.children ?? 0),
        purpose: "pilgrimage",
        members: members.filter((m) => m.name.trim()),
        consent: Boolean(draft.consent),
        whatsappOptIn: Boolean(draft.whatsappOptIn),
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof PublicApiError ? e.message : t.failed)
    } finally {
      setBusy(false)
    }
  }

  if (gone) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-4">
        <Banner tone="warn">{TEXT.hi.expired}</Banner>
        <p className="mt-3 text-sm text-ink-soft">{TEXT.en.expired}</p>
      </main>
    )
  }
  if (!form) return <main className="mx-auto max-w-lg p-4"><Loading /></main>

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center p-4 text-center">
        <div className="anim-pop mb-4 grid h-20 w-20 place-items-center rounded-full bg-ok-soft">
          <Check size={40} className="text-ok" aria-hidden />
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t.doneTitle}</h1>
        <p className="text-ink-soft">{t.doneBody}</p>
        {/* What the desk now holds, including anything they corrected while the guest watched. */}
        <dl className="mt-6 w-full space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-left text-sm">
          {([["name", t.name], ["phone", t.phone], ["city", t.city], ["address", t.address]] as [FieldName, string][])
            .filter(([field]) => value(field))
            .map(([field, label]) => (
              <div key={field} className="flex justify-between gap-3">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="font-semibold">{value(field)}</dd>
              </div>
            ))}
        </dl>
        {recent.length > 0 && <p className="mt-2 text-xs font-medium text-brand-ink">{t.deskEdited}</p>}
      </main>
    )
  }

  const canSend = value("name").trim().length > 0 && (!form.askConsent || Boolean(draft.consent)) && !busy
  const ocrLabels = { read: t.ocrRead, verify: t.ocrVerify, use: t.ocrUse }

  /** One field of the shared draft, with whatever the ID photo suggested for it underneath. */
  const box = (field: FieldName, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {}) => {
    const { hint, ...input } = props
    return (
      <Field label={label} hint={hint}>
        <input
          {...input}
          value={value(field)}
          onChange={(e) => write(field, e.target.value)}
          className={recent.includes(field) ? "anim-pop border-ok" : undefined}
        />
        <OcrSuggestion suggestion={ocr[field]} current={value(field)} onUse={() => live.accept(field)} labels={ocrLabels} />
      </Field>
    )
  }

  return (
    <main className="mx-auto max-w-lg space-y-3 p-4 pb-28">
      <header className="pt-4">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">{form.propertyName}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t.lead}</p>
      </header>

      {error && <Banner tone="danger">{error}</Banner>}
      {!connected && <Banner tone="warn">{t.offline}</Banner>}
      {recent.length > 0 && <Banner tone="info">{t.deskEdited}</Banner>}

      <Card className="space-y-3">
        {box("name", t.name, { autoComplete: "name", autoFocus: true })}
        {box("phone", t.phone, { inputMode: "numeric", autoComplete: "tel" })}
        {box("city", t.city, { autoComplete: "address-level2" })}
        {box("address", t.address, { autoComplete: "street-address" })}
        <div className="grid grid-cols-2 gap-2">
          {box("state", t.state, { autoComplete: "address-level1" })}
          {box("pincode", t.pincode, { inputMode: "numeric", autoComplete: "postal-code", maxLength: 10 })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {box("dob", t.dob, { type: "date" })}
          {box("email", t.email, { inputMode: "email", autoComplete: "email" })}
        </div>
      </Card>

      <Card className="space-y-3">
        <Field label={t.nationality}>
          <select value={foreign ? "foreign" : "IN"} onChange={(e) => write("nationality", e.target.value === "foreign" ? "" : "IN")}>
            <option value="IN">{t.indian}</option>
            <option value="foreign">{t.foreign}</option>
          </select>
        </Field>
        {foreign ? (
          box("passportNo", t.passport)
        ) : (
          <>
            <Field label={t.idType}>
              <select value={value("idType") || "aadhaar"} onChange={(e) => write("idType", e.target.value)}>
                {ID_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o[language]}
                  </option>
                ))}
              </select>
            </Field>
            {box("idLast4", t.idLast4, { maxLength: 4, hint: t.idHint })}
          </>
        )}

        {form.askPhoto &&
          (reading ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
              <Loader size={18} className="animate-spin" aria-hidden /> {t.reading}
            </p>
          ) : photoSent || live.session?.hasIdPhoto ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-ok">
                <Check size={18} aria-hidden /> {t.photoDone}
              </p>
              {readNote && <p className="text-xs text-ink-soft">{readNote}</p>}
              {/* A photo the reader could not use is worth retaking; the desk is not blocked either way. */}
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-ink">
                <Camera size={14} aria-hidden /> {t.takePhoto}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void takePhoto(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 py-3 font-semibold">
              <Camera size={20} aria-hidden /> {t.takePhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void takePhoto(e.target.files?.[0])}
              />
            </label>
          ))}
      </Card>

      <Card className="space-y-3">
        {/* Two steppers do not fit side by side on a 360px phone; the + button fell off the right edge. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Stepper label={t.adults} value={Number(draft.adults ?? 1)} min={1} onChange={(n) => write("adults", n)} />
          <Stepper label={t.children} value={Number(draft.children ?? 0)} onChange={(n) => write("children", n)} />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-ink-soft">{t.members}</p>
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={m.name}
                placeholder={t.memberName}
                onChange={(e) => write("members", members.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))}
              />
              <button
                type="button"
                aria-label={t.remove}
                className="rounded-xl border border-line-strong px-3 text-ink-soft"
                onClick={() => write("members", members.filter((_, j) => j !== i))}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          ))}
          {members.length < 20 && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-ink"
              onClick={() => setMany({ members: [...members, { name: "", adult: true }] })}
            >
              <Plus size={18} aria-hidden /> {t.addMember}
            </button>
          )}
        </div>
      </Card>

      <Card className="space-y-1">
        {form.askConsent && (
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={Boolean(draft.consent)} onChange={(e) => write("consent", e.target.checked)} />
            <span>{form.consentText}</span>
          </label>
        )}
        <label className="flex gap-3 text-sm">
          <input type="checkbox" checked={Boolean(draft.whatsappOptIn)} onChange={(e) => write("whatsappOptIn", e.target.checked)} />
          <span>{t.whatsapp}</span>
        </label>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 p-4 backdrop-blur" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {/* The button is inline-flex, so it is this wrapper that keeps it under the form on a screen wider than a phone. */}
        <div className="mx-auto max-w-lg">
          <Button size="lg" className="w-full" disabled={!canSend} onClick={send}>
            <Check size={20} aria-hidden /> {busy ? t.sending : t.submit}
          </Button>
        </div>
      </div>
    </main>
  )
}
