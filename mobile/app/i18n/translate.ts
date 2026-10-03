import i18n from "i18next"
import type { TOptions } from "i18next"

import type { TxKeyPath } from "."

/** Translate a key; before i18n is ready (or for an unknown key) the key itself comes back. */
export function translate(key: TxKeyPath, options?: TOptions): string {
  if (i18n.isInitialized) return i18n.t(key, options)
  return key
}

/**
 * Translate a key that may not exist (server enums such as `source.phone`): returns `fallback` when
 * there is no string, the way the web's `useLabel()` does.
 */
export function translateOr(key: string, fallback: string, options?: TOptions): string {
  if (!i18n.isInitialized || !i18n.exists(key)) return fallback
  return i18n.t(key, options)
}
