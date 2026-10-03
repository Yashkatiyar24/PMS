/** One store per domain module, all hanging off this root. Screens reach them through `useStores()`. */
import { Instance, types } from "mobx-state-tree"

import { AuthStore } from "@/features/auth/store/AuthStore"
import { NotificationStore } from "@/features/notifications/store/NotificationStore"

export const RootStore = types.model("RootStore", {
  auth: types.optional(AuthStore, {}),
  notifications: types.optional(NotificationStore, {}),
})

export interface RootStoreType extends Instance<typeof RootStore> {}
