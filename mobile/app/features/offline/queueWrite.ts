/**
 * Run a write that may be queued: when the network is down the request is stored on the phone and the caller
 * hears `queued` instead of a failure. Used for check-ins and folio payments only, as on the web.
 */
import { showToast } from "@/components"
import { translate } from "@/i18n/translate"
import { isOffline, type ApiResult } from "@/services/api"

import { enqueue } from "./queue"
import { syncEvents } from "./syncEvents"

export type QueuedWrite<T> = ApiResult<T> | { ok: false; queued: true }

export async function writeOrQueue<T>(
  request: () => Promise<ApiResult<T>>,
  entry: { clientUuid: string; path: string; body: unknown },
): Promise<QueuedWrite<T>> {
  const result = await request()
  if (result.ok || !isOffline(result.problem)) return result
  if (!enqueue({ method: "POST", ...entry })) return result
  syncEvents.emit("queued", entry.clientUuid)
  showToast(translate("error.offlineSaved"), "info", 4000)
  return { ok: false, queued: true }
}

export function wasQueued<T>(result: QueuedWrite<T>): result is { ok: false; queued: true } {
  return !result.ok && "queued" in result
}
