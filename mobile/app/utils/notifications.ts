/**
 * Push notifications through Firebase Cloud Messaging. The only file that imports @react-native-firebase/messaging;
 * the app sees permission, token and message events, never Firebase types.
 */
import { Platform } from "react-native"
import { getApp } from "@react-native-firebase/app"
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging"

import type { PushData } from "@/features/notifications/types"

import { logWarn } from "./logger"

export type PushMessage = { title: string; body: string; data: PushData }
export type Unsubscribe = () => void

const messaging = () => getMessaging(getApp())

/** Ask the OS for permission; true when notifications may be shown. */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const status = await requestPermission(messaging())
    return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL
  } catch (e) {
    logWarn("push permission failed", e)
    return false
  }
}

/** This device's FCM token, or null when Firebase is not configured. */
export async function getPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === "ios") await registerDeviceForRemoteMessages(messaging())
    return await getToken(messaging())
  } catch (e) {
    logWarn("push token unavailable", e)
    return null
  }
}

export function onPushTokenRefresh(listener: (token: string) => void): Unsubscribe {
  return onTokenRefresh(messaging(), listener)
}

/** A message arrived while the app is in front. */
export function onForegroundPush(listener: (message: PushMessage) => void): Unsubscribe {
  return onMessage(messaging(), (m) => listener(toPushMessage(m)))
}

/** The user tapped a notification while the app was in the background. */
export function onPushOpened(listener: (message: PushMessage) => void): Unsubscribe {
  return onNotificationOpenedApp(messaging(), (m) => listener(toPushMessage(m)))
}

/** The notification that launched the app from a killed state, if any. */
export async function initialPush(): Promise<PushMessage | null> {
  const m = await getInitialNotification(messaging())
  return m ? toPushMessage(m) : null
}

/** Runs headless when a message arrives with the app killed or in the background. Call once at module load. */
export function setBackgroundPushHandler(handler: (message: PushMessage) => Promise<void>): void {
  setBackgroundMessageHandler(messaging(), (m) => handler(toPushMessage(m)))
}

export function pushPlatform(): "android" | "ios" {
  return Platform.OS === "ios" ? "ios" : "android"
}

type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0]

function toPushMessage(m: RemoteMessage): PushMessage {
  const data = (m.data ?? {}) as Record<string, string>
  return {
    title: m.notification?.title ?? "",
    body: m.notification?.body ?? "",
    data: { kind: data.kind, link: data.link, notificationId: data.notificationId },
  }
}
