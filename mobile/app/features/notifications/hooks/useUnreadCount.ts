import { useEffect } from "react"
import { AppState } from "react-native"

import { useStores } from "@/models/useStores"

const POLL_MS = 60_000

/** The unread badge: refreshed once a minute while the app is in front, as on the web. */
export function useUnreadCount(): number {
  const { auth, notifications } = useStores()
  const enabled = auth.isSignedIn && !!auth.user?.propertyId
  useEffect(() => {
    if (!enabled) return
    void notifications.load()
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void notifications.load()
    }, POLL_MS)
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void notifications.load()
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [enabled, notifications])
  return enabled ? notifications.unread : 0
}
