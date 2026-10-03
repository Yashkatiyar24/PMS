export type NotificationKind =
  | "check_in"
  | "room_dirty"
  | "room_ready"
  | "new_booking"
  | "booking_cancelled"
  | "checkout_reminder"
  | "payment_received"
  | "payment_failed"
  | "payment_short"
  | "payment_after_expiry"
  | "maintenance"
  | "low_stock"

export type NotificationItem = {
  id: string
  kind: NotificationKind | string
  title: string
  body: string
  /** A desk-app path such as `/stays/{id}`; mapped to a screen by `navigators/linking.ts`. */
  link: string | null
  createdAt: string
  unread: boolean
}

export type Feed = { items: NotificationItem[]; unread: number }

export type PushTokenInput = { token: string; platform: "android" | "ios" | "web" }

/** What an FCM message carries once the backend includes its data map. */
export type PushData = { kind?: string; link?: string; notificationId?: string }
