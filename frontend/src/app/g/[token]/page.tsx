"use client"

/**
 * The guest filling their own details, on their own phone, after scanning the QR at the desk.
 *
 * This is the register book, handed to the person it is about. Whoever opens it has no account, may never
 * have used the app before, and is standing in a queue — so it asks the fewest questions the register needs,
 * in their own language, one screen, with a single button at the end.
 *
 * Nothing here is behind a login: the random token in the URL is the whole credential. Submitting stores
 * what was typed for the desk to look at; it does not create a guest, a booking or a charge on its own.
 */
import { use, useCallback, useEffect, useState } from "react"
import { Camera, Check, Plus, X } from "lucide-react"
import { getForm, PublicApiError, submitForm, uploadPhoto } from "@/lib/public-api"
import { Banner, Button, Card, Field, Loading } from "@/components/ui"

type Form = {
  propertyName: string
  language: "hi" | "en"
  askPhoto: boolean
  askConsent: boolean
  consentText: string
  alreadyDone: boolean
}

type Member = { name: string; adult: boolean }

/** The guest's phone may be set to either language, so this screen carries its own strings. */
const TEXT = {
  hi: {
    title: "अपनी जानकारी भरें",
    lead: "यह जानकारी अतिथि रजिस्टर के लिए है। भरने के बाद रिसेप्शन पर बताएं।",
    name: "पूरा नाम", city: "शहर या गाँव", address: "पता", phone: "मोबाइल नंबर",
    nationality: "राष्ट्रीयता", indian: "भारतीय", foreign: "विदेशी", passport: "पासपोर्ट नंबर",
    idType: "पहचान पत्र", idLast4: "पहचान पत्र के आखिरी 4 अंक",
    idHint: "पूरा आधार नंबर न लिखें, केवल आखिरी 4 अंक",
    photo: "पहचान पत्र की फोटो", takePhoto: "फोटो लें", photoDone: "फोटो भेज दी गई",
    adults: "बड़े", children: "बच्चे", members: "साथ के लोग", memberName: "नाम",
    addMember: "और जोड़ें", remove: "हटाएं",
    whatsapp: "मुझे व्हाट्सएप पर रसीद भेजें",
    submit: "भेजें", sending: "भेजा जा रहा है…",
    doneTitle: "धन्यवाद", doneBody: "आपकी जानकारी रिसेप्शन तक पहुँच गई है। अब वहाँ जाएँ।",
    expired: "यह लिंक अब काम नहीं करता। रिसेप्शन से नया QR कोड मांगें।",
    failed: "कुछ गड़बड़ हुई। फिर कोशिश करें।",
    required: "कृपया नाम भरें",
  },
  en: {
    title: "Fill in your details",
    lead: "These details are for the guest register. Tell the desk when you are done.",
    name: "Full name", city: "City or village", address: "Address", phone: "Mobile number",
    nationality: "Nationality", indian: "Indian", foreign: "Foreign", passport: "Passport number",
    idType: "ID type", idLast4: "Last 4 digits of ID",
    idHint: "Do not write the full Aadhaar number, only the last 4 digits",
    photo: "Photo of your ID", takePhoto: "Take photo", photoDone: "Photo sent",
    adults: "Adults", children: "Children", members: "People with you", memberName: "Name",
    addMember: "Add another", remove: "Remove",
    whatsapp: "Send me the receipt on WhatsApp",
    submit: "Send", sending: "Sending…",
    doneTitle: "Thank you", doneBody: "Your details have reached the desk. Please go there now.",
    expired: "This link no longer works. Please ask the desk for a new QR code.",
    failed: "Something went wrong. Please try again.",
    required: "Please fill in your name",
  },
} as const

const ID_TYPES = [
  { value: "aadhaar", hi: "आधार", en: "Aadhaar" },
  { value: "voter", hi: "वोटर आईडी", en: "Voter ID" },
  { value: "dl", hi: "ड्राइविंग लाइसेंस", en: "Driving licence" },
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

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("")
  const [address, setAddress] = useState("")
  const [foreign, setForeign] = useState(false)
  const [passportNo, setPassportNo] = useState("")
  const [idType, setIdType] = useState("aadhaar")
  const [idLast4, setIdLast4] = useState("")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [consent, setConsent] = useState(false)
  const [whatsappOptIn, setWhatsappOptIn] = useState(false)
  const [photoSent, setPhotoSent] = useState(false)

  useEffect(() => {
    let live = true
    getForm<Form>(token)
      .then((f) => {
        if (!live) return
        setForm(f)
        if (f.alreadyDone) setDone(true)
      })
      .catch(() => live && setGone(true))
    return () => {
      live = false
    }
  }, [token])

  const language = form?.language ?? "hi"
  const t = TEXT[language]

  const takePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setError(null)
      try {
        await uploadPhoto(token, file)
        setPhotoSent(true)
      } catch (e) {
        setError(e instanceof PublicApiError ? e.message : t.failed)
      }
    },
    [token, t.failed],
  )

  async function send() {
    if (!name.trim()) return setError(t.required)
    setBusy(true)
    setError(null)
    try {
      await submitForm(token, {
        name,
        phone,
        city,
        address,
        nationality: foreign ? "" : "IN",
        idType,
        idLast4,
        passportNo: foreign ? passportNo : null,
        adults,
        children,
        purpose: "pilgrimage",
        members: members.filter((m) => m.name.trim()),
        consent,
        whatsappOptIn,
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
      <main className="mx-auto max-w-lg p-4 pt-10">
        <Banner tone="warn">{TEXT.hi.expired}</Banner>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{TEXT.en.expired}</p>
      </main>
    )
  }
  if (!form) return <Loading />

  if (done) {
    return (
      <main className="mx-auto max-w-lg p-4 pt-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-ok-bg)]">
          <Check size={32} className="text-[var(--color-ok)]" aria-hidden />
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t.doneTitle}</h1>
        <p className="text-[var(--color-ink-soft)]">{t.doneBody}</p>
      </main>
    )
  }

  const canSend = name.trim().length > 0 && (!form.askConsent || consent) && !busy

  return (
    <main className="mx-auto max-w-lg space-y-3 p-4 pb-10">
      <header className="pt-4">
        <p className="text-sm font-semibold text-[var(--color-brand)]">{form.propertyName}</p>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t.lead}</p>
      </header>

      {error && <Banner tone="danger">{error}</Banner>}

      <Card className="space-y-3">
        <Field label={t.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        </Field>
        <Field label={t.phone}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel" />
        </Field>
        <Field label={t.city}>
          <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </Field>
        <Field label={t.address}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
        </Field>
      </Card>

      <Card className="space-y-3">
        <Field label={t.nationality}>
          <select value={foreign ? "foreign" : "IN"} onChange={(e) => setForeign(e.target.value === "foreign")}>
            <option value="IN">{t.indian}</option>
            <option value="foreign">{t.foreign}</option>
          </select>
        </Field>
        {foreign ? (
          <Field label={t.passport}>
            <input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label={t.idType}>
              <select value={idType} onChange={(e) => setIdType(e.target.value)}>
                {ID_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o[language]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.idLast4} hint={t.idHint}>
              <input value={idLast4} onChange={(e) => setIdLast4(e.target.value)} maxLength={4} />
            </Field>
          </>
        )}

        {form.askPhoto &&
          (photoSent ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ok)]">
              <Check size={18} aria-hidden /> {t.photoDone}
            </p>
          ) : (
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] py-3 font-semibold">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.adults}>
            <input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
              inputMode="numeric"
            />
          </Field>
          <Field label={t.children}>
            <input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">{t.members}</p>
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={m.name}
                placeholder={t.memberName}
                onChange={(e) =>
                  setMembers(members.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
                }
              />
              <button
                type="button"
                aria-label={t.remove}
                className="rounded-xl border border-[var(--color-line)] px-3"
                onClick={() => setMembers(members.filter((_, j) => j !== i))}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          ))}
          {members.length < 20 && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm font-semibold"
              onClick={() => setMembers([...members, { name: "", adult: true }])}
            >
              <Plus size={18} aria-hidden /> {t.addMember}
            </button>
          )}
        </div>
      </Card>

      <Card className="space-y-1">
        {form.askConsent && (
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{form.consentText}</span>
          </label>
        )}
        <label className="flex gap-3 text-sm">
          <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
          <span>{t.whatsapp}</span>
        </label>
      </Card>

      <Button className="w-full py-4 text-lg" disabled={!canSend} onClick={send}>
        <Check size={20} aria-hidden /> {busy ? t.sending : t.submit}
      </Button>
    </main>
  )
}
