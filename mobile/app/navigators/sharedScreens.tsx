/**
 * The screens every tab's stack can reach (a stay, a guest, the operations modules…). One list, registered in
 * each stack, so "open this stay" works from wherever the desk is.
 */
import { SessionsScreen } from "@/features/auth/screens/SessionsScreen"
import { NotificationsScreen } from "@/features/notifications/screens/NotificationsScreen"
import { ReceiptViewerScreen } from "@/features/receipts/screens/ReceiptViewerScreen"
import { placeholderScreen } from "@/screens/PlaceholderScreen"

import type { ScreenComponent, SharedStackParamList } from "./navigationTypes"

type Entry = { name: keyof SharedStackParamList; component: ScreenComponent }

export const sharedScreens: Entry[] = [
  { name: "Stay", component: placeholderScreen("Stay") },
  { name: "CheckIn", component: placeholderScreen("Check-in") },
  { name: "NewBooking", component: placeholderScreen("New booking") },
  { name: "Guest", component: placeholderScreen("Guest") },
  { name: "NeedsAttention", component: placeholderScreen("Needs attention") },
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
