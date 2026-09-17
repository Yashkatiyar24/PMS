"use client"

import { useCallback, useEffect, useState } from "react"
import { ApiError } from "./api"

type Resource<T> = {
  data: T | null
  error: string
  loading: boolean
  /** Fetch again, e.g. after a write or after the offline queue drains. */
  reload: () => void
  /** Replace the data locally, for optimistic updates. */
  set: (updater: (current: T) => T) => void
}

/**
 * Loads something from the API and keeps it on screen.
 *
 * One hook instead of the same twelve lines on every screen, and one place to get the awkward parts right:
 * a reply that arrives after the user has navigated away is dropped rather than setting state on a gone
 * component, and the three pieces of state move together in one update so no render ever sees data and
 * "still loading" at the same time.
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[], fallbackMessage: string): Resource<T> {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({
    data: null,
    error: "",
    loading: true,
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let current = true
    load()
      .then((data) => {
        if (current) setState({ data, error: "", loading: false })
      })
      .catch((cause: unknown) => {
        if (current) setState({ data: null, error: cause instanceof ApiError ? cause.message : fallbackMessage, loading: false })
      })
    return () => {
      current = false
    }
    // The loader closes over the caller's own inputs, which are what `deps` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  const set = useCallback(
    (updater: (current: T) => T) =>
      setState((s) => (s.data === null ? s : { ...s, data: updater(s.data) })),
    [],
  )

  return { data: state.data, error: state.error, loading: state.loading, reload, set }
}

/** Reload whenever the offline queue finishes sending, so synced entries appear without a manual refresh. */
export function useReloadAfterSync(reload: () => void) {
  useEffect(() => {
    window.addEventListener("pms:synced", reload)
    return () => window.removeEventListener("pms:synced", reload)
  }, [reload])
}
