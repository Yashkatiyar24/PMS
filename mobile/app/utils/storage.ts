/**
 * The only file that touches react-native-mmkv. Three stores:
 *  - `storage`: plain app data (preferences, navigation state, cached lists);
 *  - `secure`: the session token, in an encrypted instance;
 *  - `queue`: offline writes waiting to be sent.
 * Swapping the storage library means changing only this file.
 */
import { Platform } from "react-native"
import { MMKV } from "react-native-mmkv"

export const storage = new MMKV()
// A browser's MMKV is localStorage and cannot encrypt; the web build holds no token there anyway (the browser keeps
// the HttpOnly cookie), only the remembered property code.
const secure = new MMKV(
  Platform.OS === "web"
    ? { id: "pms-secure" }
    : { id: "pms-secure", encryptionKey: "pms-secure-v1" },
)
const queue = new MMKV({ id: "pms-queue" })

/** Read a string, or null when missing or unreadable. */
export function loadString(key: string): string | null {
  try {
    return storage.getString(key) ?? null
  } catch {
    return null
  }
}

/** Write a string; false when storage refused it. */
export function saveString(key: string, value: string): boolean {
  try {
    storage.set(key, value)
    return true
  } catch {
    return false
  }
}

/** Read and JSON-parse a value, or null. */
export function load<T>(key: string): T | null {
  const raw = loadString(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** JSON-stringify and write a value. */
export function save(key: string, value: unknown): boolean {
  try {
    return saveString(key, JSON.stringify(value))
  } catch {
    return false
  }
}

/** Delete one key. */
export function remove(key: string): void {
  try {
    storage.delete(key)
  } catch {
    /* nothing to remove */
  }
}

/** Delete every key in the plain store. */
export function clear(): void {
  try {
    storage.clearAll()
  } catch {
    /* already empty */
  }
}

/** Delete every key in the plain store that starts with `prefix` (used to drop cached lists). */
export function removeByPrefix(prefix: string): void {
  try {
    storage
      .getAllKeys()
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => storage.delete(k))
  } catch {
    /* nothing cached */
  }
}

/** A per-device preference such as language or theme. */
export function loadPreference(key: string): string | null {
  return loadString(key)
}

/** Save a per-device preference. */
export function savePreference(key: string, value: string): void {
  saveString(key, value)
}

/** Read from the encrypted store. */
export function loadSecure(key: string): string | null {
  try {
    return secure.getString(key) ?? null
  } catch {
    return null
  }
}

/** Write to the encrypted store; an empty value deletes the key. */
export function saveSecure(key: string, value: string | null): void {
  try {
    if (value === null || value === "") secure.delete(key)
    else secure.set(key, value)
  } catch {
    /* a failed secure write means the user signs in again next launch */
  }
}

/** Read a JSON value from the offline-queue store. */
export function loadQueue<T>(key: string): T | null {
  try {
    const raw = queue.getString(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Write a JSON value to the offline-queue store. */
export function saveQueue(key: string, value: unknown): void {
  try {
    queue.set(key, JSON.stringify(value))
  } catch {
    /* the caller reports the write as not saved */
  }
}
