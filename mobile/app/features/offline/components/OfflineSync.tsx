import { useOfflineSync } from "../hooks/useOfflineSync"

/** Mounts the queue owner + replay loop once, inside the store provider. */
export function OfflineSync() {
  useOfflineSync()
  return null
}
