/**
 * Once signed in: ask for permission, register the FCM token with the backend (again on refresh and on
 * property switch), show foreground pushes as toasts and deep-link on tap — including the tap that launched
 * the app from a killed state.
 */
import { useEffect } from "react"

import { showToast } from "@/components"
import { useStores } from "@/models/useStores"
import { openPath } from "@/navigators/linking"
import { logWarn } from "@/utils/logger"
import {
  getPushToken,
  initialPush,
  onForegroundPush,
  onPushOpened,
  onPushTokenRefresh,
  pushPlatform,
  requestPushPermission,
  type PushMessage,
} from "@/utils/notifications"

export function usePushSetup(): void {
  const { auth, notifications } = useStores()
  const signedIn = auth.isSignedIn
  const propertyId = auth.user?.propertyId ?? null

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false

    const register = async (token: string | null) => {
      if (!token || cancelled) return
      const ok = await notifications.registerPushToken(token, pushPlatform())
      if (!ok) logWarn("push token not registered")
    }

    const opened = (message: PushMessage) => {
      void notifications.load()
      openPath(message.data.link)
    }

    void (async () => {
      const allowed = await requestPushPermission()
      if (!allowed) return
      await register(await getPushToken())
      const launch = await initialPush()
      if (launch) opened(launch)
    })()

    const offToken = onPushTokenRefresh((t) => void register(t))
    const offForeground = onForegroundPush((m) => {
      showToast(m.title ? `${m.title}${m.body ? ` · ${m.body}` : ""}` : m.body, "info", 4000)
      void notifications.load()
    })
    const offOpened = onPushOpened(opened)

    return () => {
      cancelled = true
      offToken()
      offForeground()
      offOpened()
    }
  }, [signedIn, propertyId, notifications])
}
