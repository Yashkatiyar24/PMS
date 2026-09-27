import { useEffect, useState } from "react"

import { Banner } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { isOnline, onConnectivityChange } from "@/utils/network"

import { syncEvents } from "../syncEvents"

/** Shown above a screen when offline, while syncing, or when queued writes need attention. */
export function OfflineBar() {
  const navigation = useAppNavigation()
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [counts, setCounts] = useState({ pending: 0, failed: 0 })

  useEffect(() => {
    void isOnline().then(setOnline)
    const offNet = onConnectivityChange(setOnline)
    const offSync = syncEvents.on("syncing", setSyncing)
    const offCounts = syncEvents.on("counts", setCounts)
    return () => {
      offNet()
      offSync()
      offCounts()
    }
  }, [])

  if (online && counts.pending === 0 && counts.failed === 0) return null
  return (
    <>
      {(!online || counts.pending > 0) && (
        <Banner
          tone={online ? "info" : "warn"}
          text={
            syncing
              ? translate("offline.syncing")
              : translate("offline.banner", { count: counts.pending })
          }
        />
      )}
      {counts.failed > 0 && (
        <Banner
          tone="danger"
          text={`${translate("offline.needsAttention")} (${counts.failed})`}
          actionText={translate("common.more")}
          onAction={() => navigation.navigate("NeedsAttention")}
        />
      )}
    </>
  )
}
