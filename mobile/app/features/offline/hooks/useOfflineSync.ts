/**
 * Owns the offline queue for the signed-in user: scopes it, replays it when the network returns and every 30 s,
 * and publishes counts for the OfflineBar. Mounted once (`OfflineSync`).
 */
import { useEffect } from "react"

import { useStores } from "@/models/useStores"
import { api } from "@/services/api"
import { isOnline, onConnectivityChange } from "@/utils/network"

import { failed, flush, pending, setQueueOwner } from "../queue"
import { syncEvents } from "../syncEvents"

const RETRY_MS = 30_000

export function useOfflineSync(): void {
  const { auth } = useStores()
  const userId = auth.user?.id ?? null
  const propertyId = auth.user?.propertyId ?? null

  useEffect(() => {
    setQueueOwner(userId ? { userId, propertyId } : null)
    syncEvents.emit("counts", { pending: pending().length, failed: failed().length })
    if (!userId) return

    let busy = false
    const run = async () => {
      if (busy || pending().length === 0) return
      busy = true
      syncEvents.emit("syncing", true)
      const result = await flush((entry) => api.client.post(entry.path, entry.body))
      busy = false
      syncEvents.emit("syncing", false)
      syncEvents.emit("counts", { pending: pending().length, failed: failed().length })
      if (result.sent > 0) syncEvents.emit("synced", result.sent)
    }

    const runIfOnline = () => void isOnline().then((online) => (online ? run() : undefined))
    runIfOnline()
    const offNet = onConnectivityChange((online) => (online ? void run() : undefined))
    const timer = setInterval(runIfOnline, RETRY_MS)
    const offQueued = syncEvents.on("queued", () => {
      syncEvents.emit("counts", { pending: pending().length, failed: failed().length })
      runIfOnline()
    })
    return () => {
      offNet()
      offQueued()
      clearInterval(timer)
    }
  }, [userId, propertyId])
}
