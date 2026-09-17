"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Things the device knows that React does not: whether there is a network, and what this phone's user
 * chose last time. Both are external stores, so they are read with useSyncExternalStore rather than copied
 * into state inside an effect. That keeps the server-rendered HTML and the first client render identical,
 * which is what stops the screen flickering on a slow phone.
 */

function subscribeToNetwork(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/** True while the browser believes it has a network. Assumed true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToNetwork,
    () => navigator.onLine,
    () => true,
  )
}

const PREFERENCE_CHANGED = "pms:preference"

function subscribeToPreferences(onChange: () => void) {
  window.addEventListener("storage", onChange)       // another tab
  window.addEventListener(PREFERENCE_CHANGED, onChange) // this tab
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(PREFERENCE_CHANGED, onChange)
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // private browsing or blocked storage
  }
}

/**
 * A setting remembered on this device, such as the language or the text size.
 *
 * @param key      storage key
 * @param fallback used when nothing is stored, or the stored value is no longer valid
 * @param isValid  guards against a stale value from an older version of the app
 */
export function usePreference<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => boolean,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => {
      const stored = read(key)
      return stored && isValid(stored) ? (stored as T) : fallback
    },
    () => fallback,
  )

  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next)
      } catch {
        /* storage blocked: the choice applies for this session only */
      }
      window.dispatchEvent(new Event(PREFERENCE_CHANGED))
    },
    [key],
  )

  return [value, set]
}
