import { useEffect, useState } from "react"
import { View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Banner, Button, Glyph, Input, Screen, Segmented, Text, Wedge } from "@/components"
import { deviceName } from "@/hooks/useDeviceName"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"
import { typography } from "@/theme/typography"
import { canSubmitPasswordLogin, loadRememberedCode, normaliseCode } from "@/utils/auth"

import { LanguageToggle } from "../components/LanguageToggle"
import { OtpLoginForm } from "../components/OtpLoginForm"

type Mode = "password" | "otp"

/** How tall the navy-to-teal band at the top is; the form starts under its slanted edge. */
const WEDGE = 300

/**
 * Property code + email + password, or a one-time code. Platform admins leave the code empty.
 *
 * The reference's sign-in: a deep navy band sliced on the diagonal, the property mark in white on it, then
 * "Sign in" large with the product name faded beside it, three underline fields and one gradient button.
 */
export const LoginScreen = observer(function LoginScreen() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  const [mode, setMode] = useState<Mode>("password")
  const [code, setCode] = useState(loadRememberedCode())
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const submit = () => void auth.loginWithPassword(code, email, password, deviceName())
  // Wake the server while the person types, so a cold start is not paid after the tap on Sign in.
  useEffect(() => {
    void auth.warmUp()
  }, [auth])

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      contentContainerStyle={$content}
      keyboardShouldPersistTaps="handled"
      systemBarStyle="light"
    >
      <View style={$band}>
        <Wedge height={WEDGE} />
        <View style={$top}>
          <View style={[$logo, { backgroundColor: theme.colors.palette.onSolidGlass }]}>
            <Glyph name="building" size={28} color={theme.colors.palette.onSolid} weight={1.6} />
          </View>
          <LanguageToggle light />
        </View>
        <Text
          text={translate("login.headline")}
          style={[$tagline, { color: theme.colors.palette.onSolid }]}
          numberOfLines={2}
        />
      </View>

      <View style={$page}>
        <View style={$brandRow}>
          <Text text={translate("login.title")} style={[$brand, { color: theme.colors.text }]} />
          <Text text="PMS" style={[$brandSub, { color: theme.colors.textFaint }]} />
        </View>
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
          {!!auth.lastProblem && (
            <Banner tone="danger" text={auth.lastProblem.message || translate("error.generic")} />
          )}
          {!!auth.serverWaking && !auth.lastProblem && (
            <Banner tone="info" text={translate("mobile.serverWaking")} />
          )}

          {mode === "password" ? (
            <>
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
                icon="arrowRight"
                size="lg"
                style={$submit}
                onPress={submit}
                disabled={auth.busy || !canSubmitPasswordLogin(code, email, password)}
                testID="login-submit"
              />
            </>
          ) : (
            <OtpLoginForm />
          )}
        </View>
      </View>
    </Screen>
  )
})

const $content: ViewStyle = { flexGrow: 1 }
const $band: ViewStyle = { height: WEDGE, paddingHorizontal: 24, paddingTop: 56, gap: 28 }
const $top: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
}
const $logo: ViewStyle = {
  width: 56,
  height: 56,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
}
const $tagline: TextStyle = {
  fontFamily: typography.display.bold,
  fontSize: 24,
  lineHeight: 30,
  letterSpacing: -0.4,
  maxWidth: 280,
}
const $page: ViewStyle = { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 6 }
const $brandRow: ViewStyle = { flexDirection: "row", alignItems: "baseline", gap: 10 }
const $brand: TextStyle = {
  fontFamily: typography.display.bold,
  fontSize: 34,
  lineHeight: 40,
  letterSpacing: -0.8,
}
const $brandSub: TextStyle = { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: 1 }
const $form: ViewStyle = { gap: 18, marginTop: 22 }
const $submit: ViewStyle = { marginTop: 8 }
