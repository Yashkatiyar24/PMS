"use client"

/**
 * The property's own record (PRD P1). The GSTIN is the field that matters most: entering one turns GST on
 * for future charges, and leaving it empty is the normal case for a trust that is not registered.
 */
import { useState } from "react"
import { api, ApiError, upload } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Disclosure, Field, Loading, PageHeader } from "@/components/ui"
import { PropertyPhoto } from "@/components/PropertyPhoto"
import { SplitPage } from "@/components/SplitPage"

type Property = {
  id: string
  name: string
  address: string
  city: string
  state: string
  phone: string
  email: string | null
  gstin: string | null
  trustRegNo: string | null
  reg12a: string | null
  reg80g: string | null
  timezone: string
  /** A short-lived link to the property's photograph, or null when it has none. Changed on its own, not with Save. */
  photoUrl: string | null
}

/** The fields Save sends; the photo travels separately and must not make the form look edited. */
const withoutPhoto = (p: Property): Property => ({ ...p, photoUrl: null })

export default function PropertySetupPage() {
  const { t } = useI18n()
  const { data: loaded, set: setLoaded } = useResource(() => api<Property>("/api/property"), [], t("error.generic"))
  const [edited, setEdited] = useState<Property | null>(null)
  const property = edited ?? loaded
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!property) return <Loading />

  const field = (key: keyof Property) => ({
    value: property[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setEdited({ ...property, [key]: e.target.value })
      setSaved(false)
    },
  })
  const dirty = edited !== null && loaded !== null && JSON.stringify(withoutPhoto(edited)) !== JSON.stringify(withoutPhoto(loaded))

  /** The photo is saved the moment it is chosen; the text fields keep whatever is half-typed. */
  async function photo(action: () => Promise<Property>) {
    setBusy(true)
    setError("")
    try {
      const saved = await action()
      setLoaded(() => saved)
      setEdited((current) => (current ? { ...current, photoUrl: saved.photoUrl } : null))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      setEdited(await api<Property>("/api/property", { method: "PUT", body: property }))
      setSaved(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("setup.property")} back="/settings" actions={<Button size="sm" disabled={busy || !dirty} onClick={save}>{t("action.save")}</Button>} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {saved && <Banner tone="ok" onClose={() => setSaved(false)}>{t("settings.savedAt")}</Banner>}

      <SplitPage
        aside={
          <PropertyPhoto
            url={property.photoUrl}
            busy={busy}
            onUpload={(blob) => photo(() => upload<Property>("/api/property/photo", blob, "photo.jpg"))}
            onRemove={() => photo(() => api<Property>("/api/property/photo", { method: "DELETE" }))}
          />
        }
      >
      <Card>
        <div className="space-y-3">
          <Field label={t("setup.name")}><input {...field("name")} /></Field>
          <Field label={t("setup.address")}><input {...field("address")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.city")}><input {...field("city")} /></Field>
            <Field label={t("setup.state")}><input {...field("state")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.phone")}><input inputMode="tel" {...field("phone")} /></Field>
            <Field label={t("setup.email")}><input type="email" {...field("email")} /></Field>
          </div>
        </div>
      </Card>

      <Disclosure title={t("setup.gstin")} summary={property.gstin || t("common.none")} defaultOpen={!!property.gstin}>
        <div className="space-y-3">
          <Field label={t("setup.gstin")} hint={t("setup.gstinHint")}><input {...field("gstin")} placeholder="09AAACH7409R1ZZ" /></Field>
          <Field label={t("setup.trustRegNo")}><input {...field("trustRegNo")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.reg12a")}><input {...field("reg12a")} /></Field>
            <Field label={t("setup.reg80g")}><input {...field("reg80g")} /></Field>
          </div>
          <Field label={t("setup.timezone")}><input {...field("timezone")} /></Field>
        </div>
      </Disclosure>

      {/* Under the thumb on a phone; a laptop already has the Save in the header. */}
      <Button size="lg" className="w-full md:hidden" disabled={busy || !dirty} onClick={save}>{t("action.save")}</Button>
      </SplitPage>
    </div>
  )
}
