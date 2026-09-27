import { useEffect, useState } from "react"
import { Image, View, type ImageStyle, type ViewStyle } from "react-native"

import {
  Button,
  Disclosure,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Text,
  showError,
  showToast,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { compressImage, pickPhoto, takePhoto } from "@/utils/image"

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
  const { theme } = useAppTheme()
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
  const photo = async (source: "camera" | "gallery") => {
    const picked = source === "camera" ? await takePhoto() : await pickPhoto()
    if (!picked) return
    const file = await compressImage(picked, 600, 1600)
    const r = await api.settings.uploadPropertyPhoto(file)
    if (!r.ok) return showError(r.problem)
    property.set(() => r.data)
  }
  const removePhoto = async () => {
    const r = await api.settings.removePropertyPhoto()
    if (!r.ok) return showError(r.problem)
    property.set(() => r.data)
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
          <Panel>
            <Text
              text={translate("property.photo")}
              weight="bold"
              size="sm"
              style={{ color: theme.colors.text }}
            />
            {property.data?.photoUrl ? (
              <Image
                source={{ uri: property.data.photoUrl }}
                style={$photo}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text
                text={translate("property.noPhoto")}
                size="xs"
                style={{ color: theme.colors.textDim }}
              />
            )}
            <Text
              text={translate("property.photoHint")}
              size="xxs"
              style={{ color: theme.colors.textFaint }}
            />
            <View style={$row}>
              <Button
                preset="secondary"
                size="sm"
                text={translate("mobile.camera")}
                onPress={() => void photo("camera")}
              />
              <Button
                preset="secondary"
                size="sm"
                text={translate("mobile.gallery")}
                onPress={() => void photo("gallery")}
              />
              {property.data?.photoUrl && (
                <Button
                  preset="ghost"
                  size="sm"
                  text={translate("property.removePhoto")}
                  onPress={() => void removePhoto()}
                />
              )}
            </View>
          </Panel>
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
const $row: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $photo: ImageStyle = { width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }
