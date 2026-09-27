import { useEffect, useRef, useState } from "react"
import {
  Image,
  Pressable,
  View,
  type ImageStyle,
  type ViewStyle,
  type TextStyle,
} from "react-native"

import { Banner, Button, Text, showToast } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { isPast } from "@/utils/date"

import type { NewLink, Registration, Submission } from "../types"

export type SelfRegistrationQrProps = {
  bookingId?: string | null
  onReceived: (submission: Submission, registration: Registration) => void
}

const POLL_MS = 2000

/** The desk shows a QR; the guest fills the form on their own phone; the desk polls until it arrives. */
export function SelfRegistrationQr({ bookingId = null, onReceived }: SelfRegistrationQrProps) {
  const { theme } = useAppTheme()
  const [link, setLink] = useState<NewLink | null>(null)
  const [state, setState] = useState<"loading" | "waiting" | "received" | "expired" | "failed">(
    "loading",
  )
  const received = useRef(false)

  const create = async () => {
    setState("loading")
    received.current = false
    const result = await api.guests.createRegistration(bookingId)
    if (!result.ok) return setState("failed")
    setLink(result.data)
    setState("waiting")
  }

  useEffect(() => {
    void create()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  useEffect(() => {
    if (state !== "waiting" || !link) return
    const timer = setInterval(async () => {
      if (isPast(link.expiresAt)) return setState("expired")
      const result = await api.guests.registration(link.id)
      if (!result.ok) return
      if (result.data.state === "submitted" && result.data.submitted && !received.current) {
        received.current = true
        setState("received")
        onReceived(result.data.submitted, result.data)
      } else if (result.data.state === "revoked") setState("expired")
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [state, link, onReceived])

  return (
    <View
      style={[$card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Text text={translate("selfreg.showTitle")} style={[$title, { color: theme.colors.text }]} />
      <Text
        text={translate("selfreg.showHint")}
        size="xs"
        style={{ color: theme.colors.textDim }}
      />
      {state === "waiting" && link && (
        <Pressable
          onPress={() => showToast(link.url, "info", 6000)}
          accessibilityRole="imagebutton"
          accessibilityLabel={translate("selfreg.copyHint")}
        >
          <Image source={{ uri: link.qrDataUri }} style={$qr} accessibilityIgnoresInvertColors />
        </Pressable>
      )}
      {state === "waiting" && (
        <Text
          text={translate("selfreg.waiting")}
          size="sm"
          style={{ color: theme.colors.textDim }}
        />
      )}
      {state === "received" && <Banner tone="ok" text={translate("selfreg.done")} />}
      {state === "expired" && <Banner tone="warn" text={translate("selfreg.expired")} />}
      {state === "failed" && <Banner tone="danger" text={translate("selfreg.failed")} />}
      {state !== "loading" && state !== "waiting" && (
        <Button preset="ghost" size="sm" text={translate("selfreg.newCode")} onPress={create} />
      )}
    </View>
  )
}

const $card: ViewStyle = {
  borderRadius: 16,
  borderWidth: 1,
  padding: 14,
  gap: 8,
  alignItems: "center",
}
const $title: TextStyle = { fontSize: 15, fontWeight: "700" }
const $qr: ImageStyle = { width: 220, height: 220, borderRadius: 8 }
