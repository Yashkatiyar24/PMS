import type { Feed, PushTokenInput } from "@/features/notifications/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/notifications/**` */
export class NotificationsApi {
  constructor(private readonly client: ApiClient) {}

  feed(): Promise<ApiResult<Feed>> {
    return this.client.get("/api/notifications")
  }

  markSeen(): Promise<ApiResult<void>> {
    return this.client.post("/api/notifications/seen")
  }

  registerPushToken(body: PushTokenInput): Promise<ApiResult<void>> {
    return this.client.post("/api/notifications/push-token", body)
  }
}
