/**
 * The screens every tab's stack can reach (a stay, a guest, the operations modules…). One list, registered in
 * each stack, so "open this stay" works from wherever the desk is.
 */
import { PlatformListScreen } from "@/features/admin/screens/PlatformListScreen"
import { PlatformPropertyScreen } from "@/features/admin/screens/PlatformPropertyScreen"
import { SessionsScreen } from "@/features/auth/screens/SessionsScreen"
import { CheckInScreen } from "@/features/bookings/screens/CheckInScreen"
import { NewBookingScreen } from "@/features/bookings/screens/NewBookingScreen"
import { StayScreen } from "@/features/bookings/screens/StayScreen"
import { GuestScreen } from "@/features/guests/screens/GuestScreen"
import { LostFoundScreen } from "@/features/maintenance/screens/LostFoundScreen"
import { MaintenanceScreen } from "@/features/maintenance/screens/MaintenanceScreen"
import { NotificationsScreen } from "@/features/notifications/screens/NotificationsScreen"
import { NeedsAttentionScreen } from "@/features/offline/screens/NeedsAttentionScreen"
import { AuditScreen } from "@/features/operations/screens/AuditScreen"
import { ExpensesScreen } from "@/features/operations/screens/ExpensesScreen"
import { InventoryScreen } from "@/features/operations/screens/InventoryScreen"
import { RestaurantScreen } from "@/features/operations/screens/RestaurantScreen"
import { ReceiptViewerScreen } from "@/features/receipts/screens/ReceiptViewerScreen"
import { PortfolioScreen } from "@/features/reports/screens/PortfolioScreen"
import { RoomTypesScreen } from "@/features/rooms/screens/RoomTypesScreen"
import { ChannelsScreen } from "@/features/settings/screens/ChannelsScreen"
import { PropertyDetailsScreen } from "@/features/settings/screens/PropertyDetailsScreen"
import { SettingsGroupScreen } from "@/features/settings/screens/SettingsGroupScreen"
import { StaffScreen } from "@/features/settings/screens/StaffScreen"
import { TaxRulesScreen } from "@/features/settings/screens/TaxRulesScreen"

import { gated } from "./gated"
import type { ScreenComponent, SharedStackParamList } from "./navigationTypes"

type Entry = { name: keyof SharedStackParamList; component: ScreenComponent }

export const sharedScreens: Entry[] = [
  { name: "Stay", component: gated(StayScreen, { anyOf: ["reservations.view"] }) },
  { name: "CheckIn", component: gated(CheckInScreen, { anyOf: ["checkin"] }) },
  { name: "NewBooking", component: gated(NewBookingScreen, { anyOf: ["reservations.create"] }) },
  { name: "Guest", component: gated(GuestScreen, { anyOf: ["reservations.view"] }) },
  { name: "NeedsAttention", component: NeedsAttentionScreen },
  { name: "Notifications", component: NotificationsScreen },
  { name: "Portfolio", component: PortfolioScreen },
  { name: "Sessions", component: SessionsScreen },
  { name: "ReceiptViewer", component: ReceiptViewerScreen },
  {
    name: "Maintenance",
    component: gated(MaintenanceScreen, { anyOf: ["maintenance", "maintenance.report"] }),
  },
  { name: "LostFound", component: gated(LostFoundScreen, { anyOf: ["lost_found"] }) },
  { name: "Restaurant", component: gated(RestaurantScreen, { anyOf: ["restaurant"] }) },
  { name: "Inventory", component: gated(InventoryScreen, { anyOf: ["inventory"] }) },
  { name: "Expenses", component: gated(ExpensesScreen, { anyOf: ["expenses"] }) },
  { name: "Audit", component: gated(AuditScreen, { anyOf: ["audit.view"] }) },
  { name: "SettingsGroup", component: SettingsGroupScreen },
  { name: "PropertyDetails", component: gated(PropertyDetailsScreen, { rank: "MANAGER" }) },
  { name: "RoomTypes", component: gated(RoomTypesScreen, { rank: "MANAGER" }) },
  { name: "TaxRules", component: gated(TaxRulesScreen, { rank: "MANAGER" }) },
  { name: "Staff", component: gated(StaffScreen, { rank: "MANAGER" }) },
  { name: "Channels", component: gated(ChannelsScreen, { rank: "MANAGER" }) },
  { name: "PlatformList", component: gated(PlatformListScreen, { superAdmin: true }) },
  { name: "PlatformProperty", component: gated(PlatformPropertyScreen, { superAdmin: true }) },
]
