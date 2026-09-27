/**
 * The root: signed out → Login; signed in with a forced password change → that screen only; a closed property →
 * the billing screen; otherwise the tabs.
 */
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { observer } from "mobx-react-lite"

import Config from "@/config"
import { BillingClosedScreen } from "@/features/auth/screens/BillingClosedScreen"
import { ForcePasswordChangeScreen } from "@/features/auth/screens/ForcePasswordChangeScreen"
import { LoginScreen } from "@/features/auth/screens/LoginScreen"
import { useStores } from "@/models/useStores"
import { ErrorBoundary } from "@/screens/ErrorScreen/ErrorBoundary"
import { useAppTheme } from "@/theme/context"

import { MainTabs } from "./MainTabs"
import type { AppStackParamList, NavigationProps } from "./navigationTypes"
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"

const exitRoutes = Config.exitRoutes

const Stack = createNativeStackNavigator<AppStackParamList>()

const AppStack = observer(function AppStack() {
  const { auth } = useStores()
  const {
    theme: { colors },
  } = useAppTheme()

  const signedIn = auth.isSignedIn
  const mustChange = signedIn && !!auth.user?.mustChangePassword
  const closed = signedIn && auth.user?.billingStatus === "closed"

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        navigationBarColor: colors.background,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!signedIn && <Stack.Screen name="Login" component={LoginScreen} />}
      {!!signedIn && !!mustChange && (
        <Stack.Screen name="ForcePasswordChange" component={ForcePasswordChangeScreen} />
      )}
      {!!signedIn && !mustChange && !!closed && (
        <Stack.Screen name="BillingClosed" component={BillingClosedScreen} />
      )}
      {!!signedIn && !mustChange && !closed && <Stack.Screen name="Main" component={MainTabs} />}
    </Stack.Navigator>
  )
})

export const AppNavigator = (props: NavigationProps) => {
  const { navigationTheme } = useAppTheme()
  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))
  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} {...props}>
      <ErrorBoundary catchErrors={Config.catchErrors}>
        <AppStack />
      </ErrorBoundary>
    </NavigationContainer>
  )
}
