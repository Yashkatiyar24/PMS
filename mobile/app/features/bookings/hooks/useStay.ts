import { useCallback, useState } from "react"

import { showError } from "@/components"
import type { Folio, Receipt } from "@/features/folio/types"
import { wasQueued, type QueuedWrite } from "@/features/offline/queueWrite"
import { useResource } from "@/hooks/useResource"
import { api, type ApiResult } from "@/services/api"

import type { Booking } from "../types"

/** Everything the Stay screen shows, and one `run` that performs an action then reloads. */
export function useStay(id: string) {
  const booking = useResource(() => api.bookings.get(id), [id], { cacheKey: `booking.${id}` })
  const folioId = booking.data?.folioId ?? null
  const folio = useResource<Folio>(() => api.folios.get(folioId ?? ""), [folioId], {
    enabled: !!folioId,
  })
  const receipts = useResource<Receipt[]>(() => api.folios.receipts(folioId ?? ""), [folioId], {
    enabled: !!folioId,
  })
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    await Promise.all([booking.reload(), folio.reload(), receipts.reload()])
  }, [booking, folio, receipts])

  /**
   * Perform a write. Returns true when it succeeded (or was queued offline); shows the server's message otherwise.
   * A 403 is returned as false too so the caller can open the PIN sheet.
   */
  const run = useCallback(
    async <T>(
      action: () => Promise<ApiResult<T> | QueuedWrite<T>>,
      onOk?: (data: T | null) => void,
    ): Promise<{ ok: boolean; status: number | null }> => {
      setBusy(true)
      const result = await action()
      setBusy(false)
      if (result.ok) {
        onOk?.(result.data)
        await reload()
        return { ok: true, status: null }
      }
      if (wasQueued(result)) {
        onOk?.(null)
        return { ok: true, status: null }
      }
      showError(result.problem)
      return { ok: false, status: result.problem.status }
    },
    [reload],
  )

  return {
    booking: booking.data as Booking | null,
    folio: folio.data,
    receipts: receipts.data ?? [],
    loading: booking.loading,
    problem: booking.problem,
    reload,
    run,
    busy,
  }
}
