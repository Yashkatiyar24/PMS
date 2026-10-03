import type { ComponentProps, ComponentType } from "react"
import type {
  NavigationContainer,
  NavigationProp,
  NavigatorScreenParams,
  RouteProp,
} from "@react-navigation/native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"

/** Screens reachable from any tab's stack: the shared desk flows. */
export type SharedStackParamList = {
  Stay: { id: string; checkedInSeconds?: number }
  CheckIn: { roomId?: string; bedId?: string } | undefined
  NewBooking: { roomId?: string; bedId?: string; date?: string } | undefined
  Guest: { id: string }
  NeedsAttention: undefined
  Notifications: undefined
  Portfolio: undefined
  Sessions: undefined
  ReceiptViewer: { path: string; title: string }
  Maintenance: undefined
  LostFound: undefined
  Restaurant: undefined
  Inventory: undefined
  Expenses: undefined
  Audit: undefined
  SettingsGroup: { group: string }
  PropertyDetails: undefined
  RoomTypes: undefined
  TaxRules: undefined
  Staff: undefined
  Channels: undefined
  PlatformList: undefined
  PlatformProperty: { id: string }
}

export type TodayStackParamList = SharedStackParamList & { Today: undefined }
export type GuestsStackParamList = SharedStackParamList & { Guests: undefined }
export type BookingsStackParamList = SharedStackParamList & { TapeChart: undefined }
export type RoomsStackParamList = SharedStackParamList & { Rooms: undefined }
export type ReportsStackParamList = SharedStackParamList & {
  Reports: undefined
  PeriodReport: undefined
}
export type SettingsStackParamList = SharedStackParamList & { Settings: undefined }
export type PlatformStackParamList = SharedStackParamList & { Platform: undefined }

export type MainTabParamList = {
  TodayTab: NavigatorScreenParams<TodayStackParamList>
  GuestsTab: NavigatorScreenParams<GuestsStackParamList>
  BookingsTab: NavigatorScreenParams<BookingsStackParamList>
  RoomsTab: NavigatorScreenParams<RoomsStackParamList>
  ReportsTab: NavigatorScreenParams<ReportsStackParamList>
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>
  PlatformTab: NavigatorScreenParams<PlatformStackParamList>
}

export type AppStackParamList = {
  Login: undefined
  ForcePasswordChange: undefined
  BillingClosed: undefined
  Main: NavigatorScreenParams<MainTabParamList>
}

/** Every route a screen may navigate to from inside the tabs: tab roots plus the shared screens. */
export type AllRoutes = SharedStackParamList & {
  Today: undefined
  Guests: undefined
  TapeChart: undefined
  Rooms: undefined
  Reports: undefined
  PeriodReport: undefined
  Settings: undefined
  Platform: undefined
}

/** A screen component as the stack navigators accept it. */
export type ScreenComponent = ComponentType<object>

/** Typed `navigation` for any screen in the app. */
export type AppNavigation = NavigationProp<AllRoutes>

/** Typed `route` for a screen. */
export type AppRoute<T extends keyof AllRoutes> = RouteProp<AllRoutes, T>

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

export interface NavigationProps extends Partial<
  ComponentProps<typeof NavigationContainer<AppStackParamList>>
> {}
