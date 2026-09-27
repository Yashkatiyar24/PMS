/**
 * Deep links. The backend's notification `link` values are desk-app paths (`/stays/{id}`, `/rooms`, …); this maps
 * them onto the app's routes so a push tap or a `padav://` URL lands on the right screen.
 */
import * as Linking from "expo-linking"

import { navigate } from "./navigationUtilities"

export const linkingPrefixes = [Linking.createURL("/"), "padav://"]

type Target = { tab: string; screen: string; params?: Record<string, string> }

/** A web path to a tab + screen, or null when the path is unknown. */
export function targetForPath(path: string): Target | null {
  const clean =
    path
      .replace(/^https?:\/\/[^/]+/, "")
      .split("?")[0]
      .replace(/\/+$/, "") || "/"
  const stay = clean.match(/^\/stays\/([^/]+)$/)
  if (stay) return { tab: "TodayTab", screen: "Stay", params: { id: stay[1] } }
  const guest = clean.match(/^\/guests\/([^/]+)$/)
  if (guest) return { tab: "GuestsTab", screen: "Guest", params: { id: guest[1] } }
  const admin = clean.match(/^\/admin\/([^/]+)$/)
  if (admin) return { tab: "PlatformTab", screen: "PlatformProperty", params: { id: admin[1] } }
  switch (clean) {
    case "/":
      return { tab: "TodayTab", screen: "Today" }
    case "/check-in":
      return { tab: "TodayTab", screen: "CheckIn" }
    case "/bookings":
      return { tab: "BookingsTab", screen: "TapeChart" }
    case "/bookings/new":
      return { tab: "BookingsTab", screen: "NewBooking" }
    case "/guests":
      return { tab: "GuestsTab", screen: "Guests" }
    case "/rooms":
      return { tab: "RoomsTab", screen: "Rooms" }
    case "/reports":
      return { tab: "ReportsTab", screen: "Reports" }
    case "/reports/period":
      return { tab: "ReportsTab", screen: "PeriodReport" }
    case "/notifications":
      return { tab: "SettingsTab", screen: "Notifications" }
    case "/needs-attention":
      return { tab: "TodayTab", screen: "NeedsAttention" }
    case "/portfolio":
      return { tab: "SettingsTab", screen: "Portfolio" }
    case "/maintenance":
      return { tab: "RoomsTab", screen: "Maintenance" }
    case "/lost-found":
      return { tab: "RoomsTab", screen: "LostFound" }
    case "/restaurant":
      return { tab: "SettingsTab", screen: "Restaurant" }
    case "/inventory":
      return { tab: "SettingsTab", screen: "Inventory" }
    case "/expenses":
      return { tab: "SettingsTab", screen: "Expenses" }
    case "/audit":
      return { tab: "SettingsTab", screen: "Audit" }
    case "/settings":
      return { tab: "SettingsTab", screen: "Settings" }
    case "/settings/channels":
      return { tab: "SettingsTab", screen: "Channels" }
    case "/settings/staff":
      return { tab: "SettingsTab", screen: "Staff" }
    case "/admin":
      return { tab: "PlatformTab", screen: "PlatformList" }
    default:
      return null
  }
}

/** Open the screen a web path points at; false when unknown. */
export function openPath(path: string | null | undefined): boolean {
  if (!path) return false
  const target = targetForPath(path)
  if (!target) return false
  navigate(
    "Main" as never,
    { screen: target.tab, params: { screen: target.screen, params: target.params } } as never,
  )
  return true
}

/** React Navigation linking config for `padav://` URLs; paths mirror the web app. */
export const linkingConfig = {
  screens: {
    Login: "login",
    Main: {
      screens: {
        TodayTab: {
          screens: {
            Today: "",
            Stay: "stays/:id",
            CheckIn: "check-in",
            NeedsAttention: "needs-attention",
          },
        },
        GuestsTab: { screens: { Guests: "guests", Guest: "guests/:id" } },
        BookingsTab: { screens: { TapeChart: "bookings", NewBooking: "bookings/new" } },
        RoomsTab: {
          screens: { Rooms: "rooms", Maintenance: "maintenance", LostFound: "lost-found" },
        },
        ReportsTab: { screens: { Reports: "reports", PeriodReport: "reports/period" } },
        SettingsTab: {
          screens: {
            Settings: "settings",
            Notifications: "notifications",
            Portfolio: "portfolio",
            Restaurant: "restaurant",
            Inventory: "inventory",
            Expenses: "expenses",
            Audit: "audit",
            Channels: "settings/channels",
            Staff: "settings/staff",
          },
        },
        PlatformTab: { screens: { PlatformList: "admin", PlatformProperty: "admin/:id" } },
      },
    },
  },
}
