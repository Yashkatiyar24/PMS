import { useNavigation, useRoute } from "@react-navigation/native"

import type { AllRoutes, AppNavigation, AppRoute } from "./navigationTypes"

/** `useNavigation()` typed with every route in the app. */
export function useAppNavigation(): AppNavigation {
  return useNavigation<AppNavigation>()
}

/** `useRoute()` typed for one screen's params. */
export function useAppRoute<T extends keyof AllRoutes>(): AppRoute<T> {
  return useRoute<AppRoute<T>>()
}
