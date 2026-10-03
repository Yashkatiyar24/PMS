import { type ViewStyle } from "react-native"
import WebView from "react-native-webview"

import { Loading } from "@/components"

export type ReceiptFrameProps = { url: string; cookie: string | null }

/** The rendered receipt, in a WebView that carries the session cookie so the API host serves it. */
export function ReceiptFrame({ url, cookie }: ReceiptFrameProps) {
  return (
    <WebView
      source={{ uri: url, headers: cookie ? { Cookie: cookie } : undefined }}
      sharedCookiesEnabled
      startInLoadingState
      renderLoading={() => <Loading rows={2} />}
      style={$web}
    />
  )
}

const $web: ViewStyle = { flex: 1 }
