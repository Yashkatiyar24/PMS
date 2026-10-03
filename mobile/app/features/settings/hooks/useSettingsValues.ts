import { useResource } from "@/hooks/useResource"
import { api } from "@/services/api"

import type { SettingValues } from "../types"

/** The property's resolved settings, cached so forms (check-in, booking, stay) open instantly. */
export function useSettingsValues(): SettingValues | null {
  return useResource<SettingValues>(() => api.settings.values(), [], { cacheKey: "settings" }).data
}
