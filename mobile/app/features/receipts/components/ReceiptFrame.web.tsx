import { Linking, View, type ViewStyle } from "react-native"

import { Button } from "@/components"
import { translate } from "@/i18n/translate"

import type { ReceiptFrameProps } from "./ReceiptFrame"

/**
 * The web build's twin: there is no WebView in a browser and the API refuses to be framed, so the receipt opens
 * in a tab of its own, where the browser sends the session cookie itself.
 */
export function ReceiptFrame({ url }: ReceiptFrameProps) {
  return (
    <View style={$wrap}>
      <Button text={translate("channels.open")} onPress={() => void Linking.openURL(url)} />
    </View>
  )
}

const $wrap: ViewStyle = { padding: 16 }
