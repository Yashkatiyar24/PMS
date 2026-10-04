import * as Messaging from "@react-native-firebase/messaging"

import {
  getPushToken,
  initialPush,
  onForegroundPush,
  pushPlatform,
  requestPushPermission,
} from "../notifications"

jest.mock("@react-native-firebase/app", () => ({ getApp: () => ({}) }))
jest.mock("@react-native-firebase/messaging", () => {
  let messageListener: ((m: unknown) => void) | null = null
  return {
    AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 },
    getMessaging: () => ({}),
    requestPermission: jest.fn(async () => 1),
    getToken: jest.fn(async () => "fcm-token"),
    registerDeviceForRemoteMessages: jest.fn(async () => undefined),
    onTokenRefresh: jest.fn(() => () => undefined),
    onMessage: jest.fn((_m: unknown, l: (m: unknown) => void) => {
      messageListener = l
      return () => undefined
    }),
    onNotificationOpenedApp: jest.fn(() => () => undefined),
    getInitialNotification: jest.fn(async () => ({
      notification: { title: "T", body: "B" },
      data: { link: "/rooms", kind: "room_dirty" },
    })),
    setBackgroundMessageHandler: jest.fn(),
    __emit: (m: unknown) => messageListener?.(m),
  }
})

describe("notifications utils", () => {
  it("asks for permission and reads the token", async () => {
    expect(await requestPushPermission()).toBe(true)
    expect(await getPushToken()).toBe("fcm-token")
    expect(["android", "ios"]).toContain(pushPlatform())
  })

  it("maps FCM messages to the app's shape", async () => {
    const launch = await initialPush()
    expect(launch).toEqual({
      title: "T",
      body: "B",
      data: { kind: "room_dirty", link: "/rooms", notificationId: undefined },
    })
    const seen: unknown[] = []
    onForegroundPush((m) => seen.push(m))
    ;(Messaging as unknown as { __emit: (m: unknown) => void }).__emit({
      notification: { title: "Hi" },
      data: { link: "/stays/1" },
    })
    expect(seen).toEqual([
      {
        title: "Hi",
        body: "",
        data: { kind: undefined, link: "/stays/1", notificationId: undefined },
      },
    ])
  })
})
