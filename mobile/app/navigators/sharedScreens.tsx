/**
 * The screens every tab's stack can reach (a stay, a guest, the operations modules…). One list, registered in
 * each stack, so "open this stay" works from wherever the desk is.
 */
import { SessionsScreen } from "@/features/auth/screens/SessionsScreen"
import { CheckInScreen } from "@/features/bookings/screens/CheckInScreen"
import { NewBookingScreen } from "@/features/bookings/screens/NewBookingScreen"
import { StayScreen } from "@/features/bookings/screens/StayScreen"
import { GuestScreen } from "@/features/guests/screens/GuestScreen"
import { NotificationsScreen } from "@/features/notifications/screens/NotificationsScreen"
import { NeedsAttentionScreen } from "@/features/offline/screens/NeedsAttentionScreen"
import { ReceiptViewerScreen } from "@/features/receipts/screens/ReceiptViewerScreen"
import { placeholderScreen } from "@/screens/PlaceholderScreen"

import type { ScreenComponent, SharedStackParamList } from "./navigationTypes"

type Entry = { name: keyof SharedStackParamList; component: ScreenComponent }

export const sharedScreens: Entry[] = [
  { name: "Stay", component: StayScreen },
  { name: "CheckIn", component: CheckInScreen },
  { name: "NewBooking", component: NewBookingScreen },
  { name: "Guest", component: GuestScreen },
  { name: "NeedsAttention", component: NeedsAttentionScreen },
  { name: "Notifications", component: NotificationsScreen },
  { name: "Portfolio", component: placeholderScreen("Portfolio") },
  { name: "Sessions", component: SessionsScreen },
  { name: "ReceiptViewer", component: ReceiptViewerScreen },
  { name: "Maintenance", component: placeholderScreen("Maintenance") },
  { name: "LostFound", component: placeholderScreen("Lost and found") },
  { name: "Restaurant", component: placeholderScreen("Restaurant") },
  { name: "Inventory", component: placeholderScreen("Inventory") },
  { name: "Expenses", component: placeholderScreen("Expenses") },
  { name: "Audit", component: placeholderScreen("Audit") },
  { name: "SettingsGroup", component: placeholderScreen("Settings") },
  { name: "PropertyDetails", component: placeholderScreen("Property") },
  { name: "RoomTypes", component: placeholderScreen("Room types") },
  { name: "TaxRules", component: placeholderScreen("Tax") },
  { name: "Staff", component: placeholderScreen("Staff") },
  { name: "Channels", component: placeholderScreen("Channels") },
  { name: "PlatformList", component: placeholderScreen("Platform") },
  { name: "PlatformProperty", component: placeholderScreen("Property") },
]
