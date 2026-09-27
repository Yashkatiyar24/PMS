import { View, type ViewStyle } from "react-native"

import { ChoiceChips, Disclosure, Input, Panel, SectionLabel, Text, showToast } from "@/components"
import { GuestLookup } from "@/features/guests/components/GuestLookup"
import { IdPhotoField } from "@/features/guests/components/IdPhotoField"
import { translate, translateOr } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import type { CheckInForm } from "../../hooks/useCheckInForm"
import { ID_TYPES } from "../../types"

export type GuestStepProps = {
  form: CheckInForm
  patch: (p: Partial<CheckInForm> | ((f: CheckInForm) => Partial<CheckInForm>)) => void
  photoRequired: boolean
  maxPhotoKb: number
}

/** Step 1: who is checking in — phone lookup, name, ID, address and photo. */
export function GuestStep({ form, patch, photoRequired, maxPhotoKb }: GuestStepProps) {
  const { theme } = useAppTheme()
  const hasPhoto = !!form.photo || !!form.registration?.hasIdPhoto || !!form.guest?.hasIdPhoto
  const summary = [
    form.idType && translateOr(`id.${form.idType}`, form.idType),
    form.idLast4 && `••${form.idLast4}`,
    hasPhoto && "📷",
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <View>
      <SectionLabel text={`1 · ${translate("checkin.guest")}`} />
      <Panel>
        <GuestLookup
          phone={form.phone}
          onPhone={(phone) => patch({ phone })}
          name={form.name}
          onName={(name) => patch({ name })}
          guest={form.guest}
          onPick={(guest) =>
            patch({
              guest,
              ...(guest
                ? {
                    city: guest.city,
                    address: guest.address,
                    idType: guest.idType ?? form.idType,
                    idLast4: guest.idLast4 ?? "",
                  }
                : {}),
            })
          }
        />
        <Disclosure
          title={translate("checkin.moreDetails")}
          summary={summary}
          defaultOpen={photoRequired}
        >
          <ChoiceChips
            value={form.idType}
            onChange={(idType) => patch({ idType })}
            options={ID_TYPES.map((t) => ({ value: t, label: translateOr(`id.${t}`, t) }))}
          />
          <Input
            label={translate("checkin.idLast4")}
            hint={translate("checkin.idLast4Hint")}
            value={form.idLast4}
            onChangeText={(t) => patch({ idLast4: t.replace(/\W/g, "").slice(0, 4) })}
            maxLength={4}
            keyboardType="number-pad"
          />
          <Input
            label={translate("checkin.address")}
            value={form.address}
            onChangeText={(address) => patch({ address })}
          />
          <Input
            label={translate("checkin.city")}
            value={form.city}
            onChangeText={(city) => patch({ city })}
          />
          {form.registration?.hasIdPhoto ? (
            <Text
              text={translate("selfreg.photoReceived")}
              size="sm"
              style={{ color: theme.colors.palette.ok }}
            />
          ) : (
            <IdPhotoField
              photo={form.photo}
              onPhoto={(photo) => patch({ photo })}
              maxKb={maxPhotoKb}
              onIdRead={(read) => {
                // Fills only what the desk left empty, and says so, so the digits get checked.
                patch((f) => ({
                  idLast4: f.idLast4 || read.idLast4,
                  ...(read.idType ? { idType: read.idType } : {}),
                }))
                showToast(translate("ocr.filled", { last4: read.idLast4 }), "info", 5000)
              }}
            />
          )}
          {!!photoRequired && !hasPhoto && (
            <Input
              label={translate("checkin.skipReason")}
              value={form.skipReason}
              onChangeText={(skipReason) => patch({ skipReason })}
              testID="checkin-skip-reason"
            />
          )}
        </Disclosure>
      </Panel>
    </View>
  )
}

export const $step: ViewStyle = { gap: 10 }
