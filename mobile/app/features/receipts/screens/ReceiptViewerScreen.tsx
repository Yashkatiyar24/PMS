import { useState } from "react"
import { View, type ViewStyle } from "react-native"
import WebView from "react-native-webview"

import { Button, Loading, PageHeader, Screen, showError } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { shareBytes } from "@/utils/files"

/**
 * Receipts, POS bills and other printables the API renders as HTML. The WebView carries the session cookie so
 * the API host serves the page; Share fetches the PDF twin when there is one.
 */
export function ReceiptViewerScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"ReceiptViewer">()
  const [sharing, setSharing] = useState(false)
  const cookie = api.client.cookie()
  const pdfPath = params.path.replace(/\/html(\?.*)?$/, "/pdf$1")
  const canShare = pdfPath !== params.path

  const share = async () => {
    setSharing(true)
    const result = await api.client.getBytes(pdfPath)
    setSharing(false)
    if (!result.ok) return showError(result.problem)
    await shareBytes("receipt.pdf", result.data, "application/pdf")
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <View style={$header}>
        <PageHeader
          title={params.title}
          onBack={() => navigation.goBack()}
          actions={
            canShare ? (
              <Button
                preset="secondary"
                size="sm"
                text={translate("mobile.share")}
                onPress={share}
                disabled={sharing}
              />
            ) : undefined
          }
        />
      </View>
      <WebView
        source={{
          uri: api.client.url(params.path),
          headers: cookie ? { Cookie: cookie } : undefined,
        }}
        sharedCookiesEnabled
        startInLoadingState
        renderLoading={() => <Loading rows={2} />}
        style={$web}
      />
    </Screen>
  )
}

const $content: ViewStyle = { flex: 1 }
const $header: ViewStyle = { paddingHorizontal: 16 }
const $web: ViewStyle = { flex: 1 }
