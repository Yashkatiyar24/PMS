/**
 * The bottom tabs. Which tabs exist follows the signed-in role exactly as the web's BottomNav does; each tab holds
 * its own stack so a stay opened from Today does not move the desk off the Today tab.
 */
import type { ComponentType } from "react"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { observer } from "mobx-react-lite"

import { Glyph, type GlyphName } from "@/components/Glyph"
import { PlatformListScreen } from "@/features/admin/screens/PlatformListScreen"
import { TapeChartScreen } from "@/features/bookings/screens/TapeChartScreen"
import { GuestsScreen } from "@/features/guests/screens/GuestsScreen"
import { PeriodReportScreen } from "@/features/reports/screens/PeriodReportScreen"
import { ReportsScreen } from "@/features/reports/screens/ReportsScreen"
import { RoomsScreen } from "@/features/rooms/screens/RoomsScreen"
import { SettingsScreen } from "@/features/settings/screens/SettingsScreen"
import { TodayScreen } from "@/features/today/screens/TodayScreen"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"
import { visibleTabs } from "@/utils/permissions"

import { FloatingTabBar } from "./FloatingTabBar"
import { gated } from "./gated"
import type { MainTabParamList, ScreenComponent, SharedStackParamList } from "./navigationTypes"
import { sharedScreens } from "./sharedScreens"

const Tab = createBottomTabNavigator<MainTabParamList>()
const Stack = createNativeStackNavigator<
  SharedStackParamList & Record<string, object | undefined>
>()

type Root = { name: string; component: ScreenComponent }

/** A stack whose first screen is the tab's root, followed by every shared screen. */
function makeStack(root: Root, extra: Root[] = []) {
  return function TabStack() {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={root.name} component={root.component} />
        {extra.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} />
        ))}
        {sharedScreens.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} />
        ))}
      </Stack.Navigator>
    )
  }
}

const TodayStack = makeStack({ name: "Today", component: TodayScreen })
const GuestsStack = makeStack({ name: "Guests", component: GuestsScreen })
const BookingsStack = makeStack({ name: "TapeChart", component: TapeChartScreen })
const RoomsStack = makeStack({ name: "Rooms", component: RoomsScreen })
const ReportsStack = makeStack(
  { name: "Reports", component: gated(ReportsScreen, { anyOf: ["revenue.view"] }) },
  [{ name: "PeriodReport", component: gated(PeriodReportScreen, { anyOf: ["revenue.view"] }) }],
)
const SettingsStack = makeStack({ name: "Settings", component: SettingsScreen })
const PlatformStack = makeStack({
  name: "Platform",
  component: gated(PlatformListScreen, { superAdmin: true }),
})

const TABS: Record<
  string,
  { route: keyof MainTabParamList; label: TxKeyPath; icon: GlyphName; component: ComponentType }
> = {
  Today: { route: "TodayTab", label: "nav.today", icon: "home", component: TodayStack },
  Guests: { route: "GuestsTab", label: "guests.title", icon: "users", component: GuestsStack },
  Bookings: {
    route: "BookingsTab",
    label: "nav.bookings",
    icon: "calendar",
    component: BookingsStack,
  },
  Rooms: { route: "RoomsTab", label: "nav.rooms", icon: "bed", component: RoomsStack },
  Reports: { route: "ReportsTab", label: "nav.reports", icon: "chart", component: ReportsStack },
  // Everything the desk reaches less often than forty times a day: guests, reports, settings, account.
  Settings: { route: "SettingsTab", label: "common.more", icon: "grid", component: SettingsStack },
  Platform: {
    route: "PlatformTab",
    label: "admin.title",
    icon: "shield",
    component: PlatformStack,
  },
}

export const MainTabs = observer(function MainTabs() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const user = auth.user
  const tabs = visibleTabs({
    permissions: user?.permissions ?? [],
    superAdmin: !!user?.superAdmin,
    propertyId: user?.propertyId ?? null,
  })
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // The outgoing tab slides a little aside and the new one in, so a change of tab is seen, not just found.
        animation: reduced ? "none" : "shift",
        tabBarActiveTintColor: theme.colors.palette.brandInk,
        tabBarInactiveTintColor: theme.colors.textDim,
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {tabs.map((key) => {
        const tab = TABS[key]
        return (
          <Tab.Screen
            key={tab.route}
            name={tab.route}
            component={tab.component}
            options={{
              title: translate(tab.label),
              tabBarIcon: ({ color, focused }) => (
                <Glyph name={tab.icon} size={22} color={color} weight={focused ? 2.2 : 1.75} />
              ),
            }}
          />
        )
      })}
    </Tab.Navigator>
  )
})
