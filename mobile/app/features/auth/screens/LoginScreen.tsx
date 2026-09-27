import { useState } from "react"
import { View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Banner, Button, Input, Screen, Segmented, Text } from "@/components"
import { deviceName } from "@/hooks/useDeviceName"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"
import { canSubmitPasswordLogin, loadRememberedCode, normaliseCode } from "@/utils/auth"

import { LanguageToggle } from "../components/LanguageToggle"
import { OtpLoginForm } from "../components/OtpLoginForm"

type Mode = "password" | "otp"

/** Property code + email + password, or a one-time code. Platform admins leave the code empty. */
export const LoginScreen = observer(function LoginScreen() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  const [mode, setMode] = useState<Mode>("password")
  const [code, setCode] = useState(loadRememberedCode())
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const submit = () => void auth.loginWithPassword(code, email, password, deviceName())

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={$content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={$top}>
        <View style={[$logo, { backgroundColor: theme.colors.primaryButton }]}>
          <Text text="⌂" style={{ color: theme.colors.onSolid, fontSize: 26 }} />
        </View>
        <LanguageToggle />
      </View>
      <Text text={translate("mobile.appName")} style={[$brand, { color: theme.colors.text }]} />
      <Text text={translate("login.lead")} size="sm" style={{ color: theme.colors.textDim }} />

      <View style={$form}>
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            auth.clearProblem()
            setMode(m)
          }}
          items={[
            { value: "password", label: translate("mobile.passwordTab") },
            { value: "otp", label: translate("mobile.otpTab") },
          ]}
        />
        {auth.lastProblem && (
          <Banner tone="danger" text={auth.lastProblem.message || translate("error.generic")} />
        )}

        {mode === "password" ? (
          <>
            <Text
              text={translate("login.dialogLead")}
              size="sm"
              style={{ color: theme.colors.textDim }}
            />
            <Input
              label={translate("login.propertyCode")}
              hint={translate("login.codeHint")}
              value={code}
              onChangeText={(t) => setCode(normaliseCode(t))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              testID="login-code"
            />
            <Input
              label={translate("login.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              testID="login-email"
            />
            <Input
              label={translate("login.password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              onSubmitEditing={submit}
              testID="login-password"
            />
            <Button
              text={translate("login.signIn")}
              size="lg"
              onPress={submit}
              disabled={auth.busy || !canSubmitPasswordLogin(code, email, password)}
              testID="login-submit"
            />
          </>
        ) : (
          <OtpLoginForm />
        )}
      </View>
    </Screen>
  )
})

const $content: ViewStyle = { padding: 20, gap: 8, flexGrow: 1, justifyContent: "center" }
const $top: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
}
const $logo: ViewStyle = {
  width: 48,
  height: 48,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
}
const $brand: TextStyle = { fontSize: 34, fontWeight: "800", letterSpacing: -1, marginTop: 12 }
const $form: ViewStyle = { gap: 14, marginTop: 20 }
