import { useEffect, useState } from "react"
import type { ViewStyle } from "react-native"

import {
  Button,
  Disclosure,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Panel,
  Screen,
  showError,
  showToast,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"

import { PropertyPhotoCard } from "../components/PropertyPhotoCard"
import type { Property, PropertyInput } from "../types"

const FIELDS: (keyof PropertyInput)[] = ["name", "address", "city", "state", "phone", "email"]
const GST_FIELDS: (keyof PropertyInput)[] = ["gstin", "trustRegNo", "reg12a", "reg80g", "timezone"]
const LABELS: Record<keyof PropertyInput, string> = {
  name: "setup.name",
  address: "setup.address",
  city: "setup.city",
  state: "setup.state",
  phone: "setup.phone",
  email: "setup.email",
  gstin: "setup.gstin",
  trustRegNo: "setup.trustRegNo",
  reg12a: "setup.reg12a",
  reg80g: "setup.reg80g",
  timezone: "setup.timezone",
}

function toInput(p: Property): PropertyInput {
  return {
    name: p.name,
    address: p.address,
    city: p.city,
    state: p.state,
    phone: p.phone,
    email: p.email ?? "",
    gstin: p.gstin ?? "",
    trustRegNo: p.trustRegNo ?? "",
    reg12a: p.reg12a ?? "",
    reg80g: p.reg80g ?? "",
    timezone: p.timezone,
  }
}

/** Name, address, contacts, GSTIN and registrations; the photo saves on its own. */
export function PropertyDetailsScreen() {
  const navigation = useAppNavigation()
  const property = useResource(() => api.settings.property(), [], { cacheKey: "property" })
  const [form, setForm] = useState<PropertyInput | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (property.data && !form) setForm(toInput(property.data))
  }, [property.data, form])

  const dirty =
    !!form && !!property.data && JSON.stringify(form) !== JSON.stringify(toInput(property.data))
  const save = async () => {
    if (!form) return
    setBusy(true)
    const r = await api.settings.updateProperty(form)
    setBusy(false)
    if (!r.ok) return showError(r.problem)
    property.set(() => r.data)
    setForm(toInput(r.data))
    showToast(translate("settings.savedAt"), "ok")
  }
  const set = (k: keyof PropertyInput) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f))
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      keyboardShouldPersistTaps="handled"
    >
      <PageHeader
        title={translate("setup.property")}
        onBack={() => navigation.goBack()}
        actions={
          <Button
            size="sm"
            text={translate("action.save")}
            onPress={save}
            disabled={!dirty || busy}
          />
        }
      />
      {property.loading && !form && <Loading />}
      {property.problem && !property.data && (
        <ErrorState message={property.problem.message} onRetry={property.reload} />
      )}
      {form && (
        <>
          <PropertyPhotoCard
            photoUrl={property.data?.photoUrl}
            upload={(file) => api.settings.uploadPropertyPhoto(file)}
            remove={() => api.settings.removePropertyPhoto()}
            onSaved={(saved) => property.set(() => saved)}
          />
          <Panel>
            {FIELDS.map((k) => (
              <Input
                key={k}
                label={translate(LABELS[k] as "setup.name")}
                value={form[k] ?? ""}
                onChangeText={set(k)}
                keyboardType={
                  k === "phone" ? "phone-pad" : k === "email" ? "email-address" : "default"
                }
                autoCapitalize={k === "email" ? "none" : "sentences"}
              />
            ))}
          </Panel>
          <Disclosure
            title={translate("setup.gstin")}
            summary={form.gstin || translate("common.none")}
            defaultOpen={!!form.gstin}
          >
            {GST_FIELDS.map((k) => (
              <Input
                key={k}
                label={translate(LABELS[k] as "setup.gstin")}
                hint={k === "gstin" ? translate("setup.gstinHint") : undefined}
                placeholder={k === "gstin" ? "09AAACH7409R1ZZ" : undefined}
                value={form[k] ?? ""}
                onChangeText={(t) => set(k)(k === "gstin" ? t.toUpperCase().slice(0, 15) : t)}
                autoCapitalize={k === "gstin" ? "characters" : "none"}
              />
            ))}
          </Disclosure>
          <Button
            size="lg"
            text={translate("action.save")}
            onPress={save}
            disabled={!dirty || busy}
          />
        </>
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
