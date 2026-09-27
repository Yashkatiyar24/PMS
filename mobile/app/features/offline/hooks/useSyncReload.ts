import { useEffect } from "react"

import { syncEvents } from "../syncEvents"

/** Reload a screen's data after queued writes reached the server. */
export function useSyncReload(reload: () => void | Promise<void>): void {
  useEffect(() => syncEvents.on("synced", () => void reload()), [reload])
}
