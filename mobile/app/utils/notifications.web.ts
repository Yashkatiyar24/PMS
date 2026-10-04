/**
 * The web build's twin of `notifications.ts`: push goes through Firebase on phones only, so in a browser every
 * call is a quiet no-op with the same signature. Metro picks this file for `--platform web`.
 */
import type { PushData } from "@/features/notifications/types"

export type PushMessage = { title: string; body: string; data: PushData }
export type Unsubscribe = () => void

const noop: Unsubscribe = () => undefined

/** No push in a browser: permission is never granted. */
export async function requestPushPermission(): Promise<boolean> {
  return false
}

/** No FCM token in a browser. */
export async function getPushToken(): Promise<string | null> {
  return null
}

/** Never fires in a browser. */
export function onPushTokenRefresh(_listener: (token: string) => void): Unsubscribe {
  return noop
}

/** Never fires in a browser. */
export function onForegroundPush(_listener: (message: PushMessage) => void): Unsubscribe {
  return noop
}

/** Never fires in a browser. */
export function onPushOpened(_listener: (message: PushMessage) => void): Unsubscribe {
  return noop
}

/** A browser is never launched by a push. */
export async function initialPush(): Promise<PushMessage | null> {
  return null
}

/** Nothing runs headless in a browser. */
export function setBackgroundPushHandler(_handler: (message: PushMessage) => Promise<void>): void {}

/** The platform the server is told; unused on web because no token is ever sent. */
export function pushPlatform(): "android" | "ios" {
  return "android"
}
