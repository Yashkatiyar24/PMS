/**
 * The bottom tabs. Which tabs exist follows the signed-in role exactly as the web's BottomNav does; each tab holds
 * its own stack so a stay opened from Today does not move the desk off the Today tab.
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { observer } from "mobx-react-lite"

import { Text } from "@/components"
import { PlatformListScreen } from "@/features/admin/screens/PlatformListScreen"
import { TapeChartScreen } from "@/features/bookings/screens/TapeChartScreen"
import { GuestsScreen } from "@/features/guests/screens/GuestsScreen"
import { PeriodReportScreen } from "@/features/reports/screens/PeriodReportScreen"
import { ReportsScreen } from "@/features/reports/screens/ReportsScreen"
import { RoomsScreen } from "@/features/rooms/screens/RoomsScreen"
import { SettingsScreen } from "@/features/settings/screens/SettingsScreen"
import { TodayScreen } from "@/features/today/screens/TodayScreen"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppTheme } from "@/theme/context"
import { visibleTabs } from "@/utils/permissions"

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
const ReportsStack = makeStack({ name: "Reports", component: ReportsScreen }, [
  { name: "PeriodReport", component: PeriodReportScreen },
])
const SettingsStack = makeStack({ name: "Settings", component: SettingsScreen })
const PlatformStack = makeStack({ name: "Platform", component: PlatformListScreen })

const TABS = {
  Today: { route: "TodayTab", label: "nav.today", glyph: "⌂", component: TodayStack },
  Guests: { route: "GuestsTab", label: "guests.title", glyph: "☺", component: GuestsStack },
  Bookings: { route: "BookingsTab", label: "nav.bookings", glyph: "▦", component: BookingsStack },
  Rooms: { route: "RoomsTab", label: "nav.rooms", glyph: "⌸", component: RoomsStack },
  Reports: { route: "ReportsTab", label: "nav.reports", glyph: "▥", component: ReportsStack },
  Settings: { route: "SettingsTab", label: "nav.settings", glyph: "⚙", component: SettingsStack },
  Platform: { route: "PlatformTab", label: "admin.title", glyph: "⛨", component: PlatformStack },
} as const

export const MainTabs = observer(function MainTabs() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
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
        tabBarActiveTintColor: theme.colors.palette.brandInk,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          minHeight: 58,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
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
              tabBarIcon: ({ color }) => (
                <Text text={tab.glyph} style={{ color, fontSize: 20, lineHeight: 24 }} />
              ),
            }}
          />
        )
      })}
    </Tab.Navigator>
  )
})
