/**
 * The single ApiService. Every endpoint the app calls lives in one of the typed groups below; screens and stores
 * never build URLs themselves. Add a group per backend module as it is built.
 */
import { AuthApi } from "./auth.api"
import { BookingsApi } from "./bookings.api"
import { ApiClient } from "./client"
import { FoliosApi } from "./folios.api"
import { GuestsApi } from "./guests.api"
import { MaintenanceApi } from "./maintenance.api"
import { NotificationsApi } from "./notifications.api"
import { ReportsApi } from "./reports.api"
import { RoomsApi } from "./rooms.api"
import { SettingsApi } from "./settings.api"

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
  readonly rooms: RoomsApi
  readonly guests: GuestsApi
  readonly folios: FoliosApi
  readonly settings: SettingsApi
  readonly reports: ReportsApi
  readonly maintenance: MaintenanceApi

  constructor(client: ApiClient = new ApiClient()) {
    this.client = client
    this.auth = new AuthApi(client)
    this.bookings = new BookingsApi(client)
    this.notifications = new NotificationsApi(client)
    this.rooms = new RoomsApi(client)
    this.guests = new GuestsApi(client)
    this.folios = new FoliosApi(client)
    this.settings = new SettingsApi(client)
    this.reports = new ReportsApi(client)
    this.maintenance = new MaintenanceApi(client)
  }
}

/** The app-wide instance. */
export const api = new ApiService()
