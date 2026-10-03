import { View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { Button, PageHeader, Screen, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"

import { ChangePasswordForm } from "../components/ChangePasswordForm"

/** Signed in with a password someone else chose: nothing else opens until it is replaced. */
export const ForcePasswordChangeScreen = observer(function ForcePasswordChangeScreen() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  return (
    <Screen preset="scroll" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$content}>
      <PageHeader title={translate("account.mustChangeTitle")} />
      <Text
        text={translate("account.mustChange")}
        size="sm"
        style={{ color: theme.colors.textDim }}
      />
      <ChangePasswordForm requireCurrent={false} onDone={() => void auth.refreshMe()} />
      <View style={$footer}>
        <Button
          preset="ghost"
          text={translate("action.logout")}
          onPress={() => void auth.logout()}
        />
      </View>
    </Screen>
  )
})

const $content: ViewStyle = { padding: 20, gap: 12 }
const $footer: ViewStyle = { marginTop: 24 }
