/** The in-app feed and its unread count, plus the FCM token registration. */
import { flow, getEnv, Instance, types } from "mobx-state-tree"

import type { Feed, NotificationItem } from "@/features/notifications/types"
import type { ApiService } from "@/services/api"

import { ProblemModel, toProblem } from "../../auth/store/problemModel"

export const NotificationStore = types
  .model("NotificationStore", {
    items: types.optional(types.frozen<NotificationItem[]>(), []),
    unread: 0,
    loading: false,
    problem: types.maybeNull(ProblemModel),
    /** The FCM token last accepted by the server, so it is not re-sent every launch. */
    registeredToken: types.maybeNull(types.string),
  })
  .actions((self) => {
    const api = (): ApiService => getEnv(self).api

    const load = flow(function* load() {
      self.loading = true
      const result = yield api().notifications.feed()
      self.loading = false
      if (result.ok) {
        const feed = result.data as Feed
        self.items = feed.items
        self.unread = feed.unread
        self.problem = null
      } else {
        self.problem = toProblem(result.problem)
      }
      return result.ok as boolean
    })

    /** Tell the server everything has been seen and clear the badge locally at once. */
    const markSeen = flow(function* markSeen() {
      if (self.unread === 0) return true
      self.unread = 0
      self.items = self.items.map((i) => ({ ...i, unread: false }))
      const result = yield api().notifications.markSeen()
      return result.ok as boolean
    })

    const registerPushToken = flow(function* registerPushToken(
      token: string,
      platform: "android" | "ios",
    ) {
      if (self.registeredToken === token) return true
      const result = yield api().notifications.registerPushToken({ token, platform })
      if (result.ok) self.registeredToken = token
      return result.ok as boolean
    })

    function reset() {
      self.items = []
      self.unread = 0
      self.problem = null
      self.registeredToken = null
    }

    return { load, markSeen, registerPushToken, reset }
  })

export interface NotificationStoreType extends Instance<typeof NotificationStore> {}
