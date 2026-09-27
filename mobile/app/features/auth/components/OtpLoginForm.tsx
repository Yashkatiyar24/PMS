import { useState } from "react"
import { View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Banner, Button, Input } from "@/components"
import { deviceName } from "@/hooks/useDeviceName"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"

/** Phone or email → 6-digit code → session. */
export const OtpLoginForm = observer(function OtpLoginForm() {
  const { auth } = useStores()
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (await auth.sendOtp(target)) setSent(true)
  }
  const verify = () => void auth.verifyOtp(target, code, deviceName())

  return (
    <View style={$form}>
      <Input
        label={translate("mobile.otpTarget")}
        value={target}
        onChangeText={setTarget}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!sent}
        testID="otp-target"
      />
      {!!sent && <Banner tone="ok" text={translate("mobile.codeSent")} />}
      {!!sent && (
        <Input
          label={translate("mobile.enterCode")}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          onSubmitEditing={verify}
          testID="otp-code"
        />
      )}
      {!sent ? (
        <Button
          text={translate("mobile.sendCode")}
          size="lg"
          onPress={send}
          disabled={auth.busy || target.trim().length < 5}
        />
      ) : (
        <>
          <Button
            text={translate("mobile.verify")}
            size="lg"
            onPress={verify}
            disabled={auth.busy || code.length !== 6}
          />
          <Button
            preset="ghost"
            text={translate("mobile.sendCode")}
            onPress={send}
            disabled={auth.busy}
          />
        </>
      )}
    </View>
  )
})

const $form: ViewStyle = { gap: 14 }
