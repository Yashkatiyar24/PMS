"use client"

/**
 * Tells the desk, at a glance, whether the phone is reaching the server and how much is waiting on it.
 * Queued entries are replayed automatically when the network returns, and again every half minute while
 * anything is left, so nobody has to remember to press anything.
 */
import { useCallback, useEffect, useState } from "react"
import { API_BASE } from "@/lib/api"
import { useOnline } from "@/lib/device"
import { failed, flush, pending } from "@/lib/offline-queue"
import { useI18n } from "@/i18n"
import { Banner } from "./ui"

export function OfflineBar() {
  const { t } = useI18n()
  const online = useOnline()
  const [counts, setCounts] = useState({ queued: 0, attention: 0, syncing: false })
  const { queued, attention, syncing } = counts

  const refresh = useCallback(async () => {
    try {
      const [waiting, rejected] = await Promise.all([pending(), failed()])
      setCounts((c) => ({ ...c, queued: waiting.length, attention: rejected.length }))
    } catch {
      /* private browsing or blocked storage: the app still works, just without a queue */
    }
  }, [])

  const sync = useCallback(async () => {
    setCounts((c) => ({ ...c, syncing: true }))
    try {
      const result = await flush(API_BASE)
      if (result.sent > 0) window.dispatchEvent(new CustomEvent("pms:synced"))
    } finally {
      setCounts((c) => ({ ...c, syncing: false }))
      await refresh()
    }
  }, [refresh])

  // Count what is waiting, and try again whenever the network returns, something is queued, or half a
  // minute passes with entries still on the device.
  useEffect(() => {
    const onQueued = () => { void refresh() }
    const onOnline = () => { void sync() }
    window.addEventListener("pms:queued", onQueued)
    window.addEventListener("online", onOnline)
    const timer = setInterval(() => { if (navigator.onLine) void sync() }, 30_000)
    onQueued()
    return () => {
      window.removeEventListener("pms:queued", onQueued)
      window.removeEventListener("online", onOnline)
      clearInterval(timer)
    }
  }, [refresh, sync])

  if (online && queued === 0 && attention === 0) return null

  return (
    <div className="mx-auto w-full max-w-3xl space-y-1 px-4 pt-3 no-print md:px-8">
      {(!online || queued > 0) && (
        <Banner tone={online ? "info" : "warn"}>
          {syncing ? t("offline.syncing") : t("offline.banner", { count: queued })}
        </Banner>
      )}
      {attention > 0 && (
        <Banner tone="danger">
          <a href="/needs-attention" className="font-semibold underline">
            {t("offline.needsAttention")} ({attention})
          </a>
        </Banner>
      )}
    </div>
  )
}
