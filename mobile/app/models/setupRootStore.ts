import { api, type ApiService } from "@/services/api"

import { RootStore, type RootStoreType } from "./RootStore"

export type StoreEnv = { api: ApiService }

/** Build the root store with the API service in its environment, and wire the 401 handler. */
export function setupRootStore(service: ApiService = api): RootStoreType {
  const env: StoreEnv = { api: service }
  const root = RootStore.create({}, env)
  service.client.setUnauthorizedHandler(() => root.auth.sessionEnded())
  return root
}
