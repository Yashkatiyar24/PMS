import { View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Button, Glyph, Screen, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"

/** The working property's account is closed: nothing loads; offer the other properties and logout. */
export const BillingClosedScreen = observer(function BillingClosedScreen() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$content}>
      <View style={[$lock, { backgroundColor: theme.colors.palette.dangerSoft }]}>
        <Glyph name="lock" size={32} color={theme.colors.palette.danger} />
      </View>
      <Text text={auth.propertyName} preset="subheading" style={{ color: theme.colors.text }} />
      <Text
        text={translate("billing.closed")}
        size="sm"
        style={[$lead, { color: theme.colors.textDim }]}
      />
      <View style={$actions}>
        {auth.otherMemberships.map((m) => (
          <Button
            key={m.propertyId}
            preset="secondary"
            text={translate("portfolio.switchTo", { name: m.propertyName })}
            onPress={() => void auth.switchProperty(m.propertyId)}
          />
        ))}
        <Button
          preset="danger"
          text={translate("action.logout")}
          onPress={() => void auth.logout()}
        />
      </View>
    </Screen>
  )
})

const $content: ViewStyle = {
  flex: 1,
  padding: 24,
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
}
const $lock: ViewStyle = {
  width: 72,
  height: 72,
  borderRadius: 36,
  alignItems: "center",
  justifyContent: "center",
}
const $lead: TextStyle = { textAlign: "center" }
const $actions: ViewStyle = { alignSelf: "stretch", gap: 10, marginTop: 16 }
