import { useState } from "react"
import { View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Banner, Button, Input, showToast } from "@/components"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { check, passwordSchema } from "@/utils/validation"

export type ChangePasswordFormProps = { requireCurrent: boolean; onDone: () => void }

/** Current (when the account has one) + new password → `POST /api/users/me/password`. */
export const ChangePasswordForm = observer(function ChangePasswordForm({
  requireCurrent,
  onDone,
}: ChangePasswordFormProps) {
  const { auth } = useStores()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string | undefined>()

  const submit = async () => {
    const valid = check(passwordSchema, next)
    if (!valid.ok) return setError(translate("account.newPasswordHint"))
    setError(undefined)
    const ok = await auth.changePassword(requireCurrent ? current : current || null, next)
    if (ok) {
      showToast(translate("account.passwordChanged"), "ok")
      onDone()
    }
  }

  return (
    <View style={$form}>
      {!!auth.lastProblem && (
        <Banner tone="danger" text={auth.lastProblem.message || translate("error.generic")} />
      )}
      <Input
        label={translate("account.currentPassword")}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoComplete="current-password"
        hint={requireCurrent ? undefined : translate("mobile.forcePasswordLead")}
      />
      <Input
        label={translate("account.newPassword")}
        hint={translate("account.newPasswordHint")}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        error={error}
      />
      <Button
        text={translate("action.save")}
        size="lg"
        onPress={submit}
        disabled={auth.busy || next.length < 8 || (requireCurrent && !current)}
      />
    </View>
  )
})

const $form: ViewStyle = { gap: 12 }
