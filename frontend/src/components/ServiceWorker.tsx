"use client"

import { useEffect } from "react"
import { isPublicScreen } from "@/lib/api"

/**
 * Registers the service worker once the page is idle, so it never delays the first check-in. Only on the
 * desk's own screens: a guest filling in the form or booking a room has no use for an offline shell, and
 * nothing of theirs should be kept on their phone.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || isPublicScreen(window.location.pathname)) return
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {})
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])
  return null
}
