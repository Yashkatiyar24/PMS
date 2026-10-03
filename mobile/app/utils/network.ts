/** Is the phone online? The only file that imports expo-network. */
import * as Network from "expo-network"

export type Unsubscribe = () => void

/** One reading of the network state. */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync()
    return !!state.isConnected && state.isInternetReachable !== false
  } catch {
    return true
  }
}

/** Be told whenever connectivity changes. */
export function onConnectivityChange(listener: (online: boolean) => void): Unsubscribe {
  const sub = Network.addNetworkStateListener((state) => {
    listener(!!state.isConnected && state.isInternetReachable !== false)
  })
  return () => sub.remove()
}

/** A fetch that failed before reaching the server (no network), as opposed to an HTTP error. */
export function isNetworkFailure(problem: { kind: string } | null | undefined): boolean {
  return problem?.kind === "cannot-connect" || problem?.kind === "timeout"
}
