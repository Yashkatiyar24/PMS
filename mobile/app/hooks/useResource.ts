/**
 * Load something from the API for a screen: loading / error / data, a `reload`, optional auto-refresh while the
 * screen is in front, and an MMKV cache so the last answer shows (with its age) before the network replies.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

import { CACHE_PREFIX } from "@/features/auth/store/AuthStore"
import type { ApiProblem, ApiResult } from "@/services/api"
import { load, save } from "@/utils/storage"

export type Resource<T> = {
  data: T | null
  problem: ApiProblem | null
  loading: boolean
  refreshing: boolean
  /** When the shown data was fetched; null when it is fresh from the network this session. */
  fetchedAt: string | null
  fromCache: boolean
  reload: () => Promise<void>
  /** Change the data locally (optimistic updates). */
  set: (updater: (current: T) => T) => void
}

type Options = {
  /** Persist under this key and show the cached copy first. Scoped by user/property by the caller. */
  cacheKey?: string
  /** Refetch this often (ms) while the app is in front; 0 = never. */
  refreshMs?: number
  /** Skip loading entirely (e.g. no permission). */
  enabled?: boolean
}

type Cached<T> = { data: T; fetchedAt: string }

export function useResource<T>(
  loader: () => Promise<ApiResult<T>>,
  deps: unknown[],
  options: Options = {},
): Resource<T> {
  const { cacheKey, refreshMs = 0, enabled = true } = options
  const key = cacheKey ? `${CACHE_PREFIX}${cacheKey}` : null
  const cached = key ? load<Cached<T>>(key) : null

  const [data, setData] = useState<T | null>(cached?.data ?? null)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [loading, setLoading] = useState(enabled && !cached)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(cached?.fetchedAt ?? null)
  const [fromCache, setFromCache] = useState(!!cached)
  const alive = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(
    async (background: boolean) => {
      if (!enabled) return
      if (background) setRefreshing(true)
      const result = await loaderRef.current()
      if (!alive.current) return
      if (result.ok) {
        const now = new Date().toISOString()
        setData(result.data)
        setProblem(null)
        setFetchedAt(now)
        setFromCache(false)
        if (key) save(key, { data: result.data, fetchedAt: now } satisfies Cached<T>)
      } else {
        setProblem(result.problem)
      }
      setLoading(false)
      setRefreshing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, key, ...deps],
  )

  useEffect(() => {
    alive.current = true
    setLoading(enabled && data === null)
    void run(data !== null)
    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  useEffect(() => {
    if (!refreshMs || !enabled) return
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void run(true)
    }, refreshMs)
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void run(true)
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [refreshMs, enabled, run])

  const reload = useCallback(() => run(true), [run])
  const set = useCallback(
    (updater: (current: T) => T) => setData((d) => (d === null ? d : updater(d))),
    [],
  )

  return { data, problem, loading, refreshing, fetchedAt, fromCache, reload, set }
}
