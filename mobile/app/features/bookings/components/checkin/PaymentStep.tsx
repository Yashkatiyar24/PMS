import { View } from "react-native"

import { ChoiceChips, MoneyInput, Panel, SectionLabel, Switch } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { paiseToInput } from "@/utils/format"

import type { CheckInForm } from "../../hooks/useCheckInForm"

export type PaymentStepProps = {
  form: CheckInForm
  patch: (p: Partial<CheckInForm>) => void
  modes: string[]
  consentRequired: boolean
  totalPaise: number
}

/** Step 3: advance, deposit, how it was paid, consent and WhatsApp. */
export function PaymentStep({ form, patch, modes, consentRequired, totalPaise }: PaymentStepProps) {
  return (
    <View>
      <SectionLabel text={`3 · ${translate("stay.payment")}`} />
      <Panel>
        <MoneyInput
          label={translate("checkin.advance")}
          value={form.advance}
          onChangeText={(advance) => patch({ advance })}
          placeholder={paiseToInput(totalPaise)}
        />
        <MoneyInput
          label={translate("checkin.deposit")}
          value={form.deposit}
          onChangeText={(deposit) => patch({ deposit })}
        />
        <ChoiceChips
          value={form.mode}
          onChange={(mode) => patch({ mode })}
          options={modes.map((m) => ({
            value: m,
            label: translateOr(`option.${m}`, m.toUpperCase()),
          }))}
        />
        {!!consentRequired && (
          <Switch
            value={form.consent}
            onValueChange={(consent) => patch({ consent })}
            label={translate("checkin.consent")}
            labelPosition="right"
          />
        )}
        <Switch
          value={form.whatsappOptIn}
          onValueChange={(whatsappOptIn) => patch({ whatsappOptIn })}
          label={translate("checkin.whatsappOptIn")}
          labelPosition="right"
        />
      </Panel>
    </View>
  )
}
