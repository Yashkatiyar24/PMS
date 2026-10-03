/* eslint-disable import/first */
/** The entry point: providers, then the navigator. */
if (__DEV__) {
  require("./devtools/ReactotronConfig.ts")
}
import "./utils/gestureHandler"

import { useEffect, useState } from "react"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { ToastHost } from "./components/ToastHost"
import { PushSetup } from "./features/notifications/components/PushSetup"
import { OfflineSync } from "./features/offline/components/OfflineSync"
import { initI18n } from "./i18n"
import { StoreProvider } from "./models/useStores"
import { AppNavigator } from "./navigators/AppNavigator"
import { linkingConfig, linkingPrefixes } from "./navigators/linking"
import { useNavigationPersistence } from "./navigators/navigationUtilities"
import { ThemeProvider } from "./theme/context"
import * as storage from "./utils/storage"

export const NAVIGATION_PERSISTENCE_KEY = "NAVIGATION_STATE"

export function App() {
  const {
    initialNavigationState,
    onNavigationStateChange,
    isRestored: isNavigationStateRestored,
  } = useNavigationPersistence(storage, NAVIGATION_PERSISTENCE_KEY)

  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    initI18n().then(() => setIsI18nInitialized(true))
  }, [])

  if (!isNavigationStateRestored || !isI18nInitialized) return null

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <KeyboardProvider>
        <ThemeProvider>
          <StoreProvider>
            <AppNavigator
              linking={{ prefixes: linkingPrefixes, config: linkingConfig }}
              initialState={initialNavigationState}
              onStateChange={onNavigationStateChange}
            />
            <PushSetup />
            <OfflineSync />
            <ToastHost />
          </StoreProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  )
}
