import * as Network from "expo-network"

import { isNetworkFailure, isOnline, onConnectivityChange } from "../network"

type NetState = { isConnected: boolean; isInternetReachable: boolean }
type Listener = (s: NetState) => void

jest.mock("expo-network", () => {
  let mockState = { isConnected: true, isInternetReachable: true }
  const mockListeners = new Set<Listener>()
  return {
    getNetworkStateAsync: jest.fn(async () => mockState),
    addNetworkStateListener: jest.fn((l: Listener) => {
      mockListeners.add(l)
      return { remove: () => mockListeners.delete(l) }
    }),
    __set: (next: NetState) => {
      mockState = next
      mockListeners.forEach((l) => l(next))
    },
  }
})

const set = (Network as unknown as { __set: (s: NetState) => void }).__set

describe("network utils", () => {
  it("reads the current state", async () => {
    set({ isConnected: true, isInternetReachable: true })
    expect(await isOnline()).toBe(true)
    set({ isConnected: false, isInternetReachable: false })
    expect(await isOnline()).toBe(false)
  })

  it("tells listeners when connectivity changes and unsubscribes", () => {
    const seen: boolean[] = []
    const off = onConnectivityChange((online) => seen.push(online))
    set({ isConnected: true, isInternetReachable: true })
    set({ isConnected: false, isInternetReachable: false })
    off()
    set({ isConnected: true, isInternetReachable: true })
    expect(seen).toEqual([true, false])
  })

  it("classifies problems", () => {
    expect(isNetworkFailure({ kind: "cannot-connect" })).toBe(true)
    expect(isNetworkFailure({ kind: "timeout" })).toBe(true)
    expect(isNetworkFailure({ kind: "server" })).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })
})
