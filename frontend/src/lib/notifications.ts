"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "./api"

export type Notification = { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string; unread: boolean }
export type Feed = { items: Notification[]; unread: number }

/**
 * How many notifications this person has not seen, checked once a minute while the app is in front of them.
 * The feed itself lives on the server; this only keeps the count on the user menu current.
 */
export function useUnreadNotifications(enabled: boolean): number {
  const [unread, setUnread] = useState(0)
  const check = useCallback(() => {
    if (!enabled || document.visibilityState !== "visible") return
    api<Feed>("/api/notifications").then((f) => setUnread(f.unread)).catch(() => {})
  }, [enabled])
  useEffect(() => {
    if (!enabled) return
    check()
    const timer = window.setInterval(check, 60_000)
    window.addEventListener("pms:notifications-seen", check)
    document.addEventListener("visibilitychange", check)
    return () => { window.clearInterval(timer); window.removeEventListener("pms:notifications-seen", check); document.removeEventListener("visibilitychange", check) }
  }, [enabled, check])
  return enabled ? unread : 0
}
