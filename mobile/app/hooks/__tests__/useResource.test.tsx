import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { ApiResult } from "@/services/api"
import { load, storage } from "@/utils/storage"

import { useResource } from "../useResource"

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })
const offline: ApiResult<never> = {
  ok: false,
  problem: { kind: "cannot-connect", status: null, message: "", temporary: true },
}

beforeEach(() => storage.clearAll())

describe("useResource", () => {
  it("loads, then caches under the key", async () => {
    const loader = jest.fn(async () => ok([1, 2, 3]))
    const { result } = renderHook(() => useResource(loader, [], { cacheKey: "nums" }))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual([1, 2, 3])
    expect(result.current.fromCache).toBe(false)
    expect(load<{ data: number[] }>("cache.nums")?.data).toEqual([1, 2, 3])
  })

  it("shows the cached copy first and keeps it when the network fails", async () => {
    storage.set("cache.nums", JSON.stringify({ data: [9], fetchedAt: "2026-01-01T00:00:00Z" }))
    const loader = jest.fn(async () => offline)
    const { result } = renderHook(() => useResource(loader, [], { cacheKey: "nums" }))
    expect(result.current.data).toEqual([9])
    expect(result.current.fromCache).toBe(true)
    expect(result.current.loading).toBe(false)
    await waitFor(() => expect(result.current.problem?.kind).toBe("cannot-connect"))
    expect(result.current.data).toEqual([9])
    expect(result.current.fetchedAt).toBe("2026-01-01T00:00:00Z")
  })

  it("reloads on demand and supports optimistic set", async () => {
    let n = 0
    const loader = jest.fn(async () => ok(++n))
    const { result } = renderHook(() => useResource(loader, []))
    await waitFor(() => expect(result.current.data).toBe(1))
    act(() => result.current.set((d) => d + 100))
    expect(result.current.data).toBe(101)
    await act(() => result.current.reload())
    expect(result.current.data).toBe(2)
  })

  it("does nothing when disabled", async () => {
    const loader = jest.fn(async () => ok(1))
    const { result } = renderHook(() => useResource(loader, [], { enabled: false }))
    expect(result.current.loading).toBe(false)
    await new Promise((r) => setTimeout(r, 10))
    expect(loader).not.toHaveBeenCalled()
  })
})
