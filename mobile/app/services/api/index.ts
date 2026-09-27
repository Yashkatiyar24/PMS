/**
 * The single ApiService. Every endpoint the app calls lives in one of the typed groups below; screens and stores
 * never build URLs themselves. Add a group per backend module as it is built.
 */
import { AuthApi } from "./auth.api"
import { BookingsApi } from "./bookings.api"
import { ApiClient } from "./client"
import { NotificationsApi } from "./notifications.api"

export type { ApiProblem, ApiProblemKind } from "./problem"
export { isOffline } from "./problem"
export type { ApiResult } from "./result"
export { mapResult } from "./result"
export type { Query, UploadFile } from "./client"

export class ApiService {
  readonly client: ApiClient
  readonly auth: AuthApi
  readonly bookings: BookingsApi
  readonly notifications: NotificationsApi

  constructor(client: ApiClient = new ApiClient()) {
    this.client = client
    this.auth = new AuthApi(client)
    this.bookings = new BookingsApi(client)
    this.notifications = new NotificationsApi(client)
  }
}

/** The app-wide instance. */
export const api = new ApiService()
