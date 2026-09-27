import type {
  ChannelLink,
  ChannelsOverview,
  Invited,
  InviteInput,
  Property,
  PropertyInput,
  Registry,
  SettingValues,
  StaffMember,
  TaxRule,
  TaxRules,
} from "@/features/settings/types"

import type { ApiClient, UploadFile } from "./client"
import type { ApiResult } from "./result"

/** `/api/settings`, `/api/property`, `/api/tax-rules`, `/api/users`, `/api/channels` */
export class SettingsApi {
  constructor(private readonly client: ApiClient) {}

  registry(): Promise<ApiResult<Registry>> {
    return this.client.get("/api/settings/registry")
  }

  values(): Promise<ApiResult<SettingValues>> {
    return this.client.get("/api/settings")
  }

  /** Partial update; a `null` value resets that key to its default. */
  update(draft: Record<string, unknown>): Promise<ApiResult<SettingValues>> {
    return this.client.patch("/api/settings", draft)
  }

  property(): Promise<ApiResult<Property>> {
    return this.client.get("/api/property")
  }

  updateProperty(body: PropertyInput): Promise<ApiResult<Property>> {
    return this.client.put("/api/property", body)
  }

  uploadPropertyPhoto(file: UploadFile): Promise<ApiResult<Property>> {
    return this.client.upload("/api/property/photo", file)
  }

  removePropertyPhoto(): Promise<ApiResult<Property>> {
    return this.client.delete("/api/property/photo")
  }

  taxRules(): Promise<ApiResult<TaxRule[]>> {
    return this.client.get("/api/tax-rules")
  }

  addTaxRule(effectiveFrom: string, rules: TaxRules): Promise<ApiResult<TaxRule>> {
    return this.client.post("/api/tax-rules", { effectiveFrom, rules })
  }

  staff(): Promise<ApiResult<StaffMember[]>> {
    return this.client.get("/api/users")
  }

  invite(body: InviteInput): Promise<ApiResult<Invited>> {
    return this.client.post("/api/users", body)
  }

  resetPassword(userId: string): Promise<ApiResult<{ password: string }>> {
    return this.client.post(`/api/users/${userId}/password`)
  }

  setRole(userId: string, role: string): Promise<ApiResult<StaffMember>> {
    return this.client.patch(`/api/users/${userId}/role`, { role })
  }

  setPin(userId: string, pin: string): Promise<ApiResult<void>> {
    return this.client.post(`/api/users/${userId}/pin`, { pin })
  }

  removeAccess(userId: string): Promise<ApiResult<void>> {
    return this.client.delete(`/api/users/${userId}`)
  }

  channels(): Promise<ApiResult<ChannelsOverview>> {
    return this.client.get("/api/channels")
  }

  createBookingPage(): Promise<ApiResult<{ slug: string }>> {
    return this.client.post("/api/channels/booking-page")
  }

  linkChannel(
    roomId: string,
    channel: string,
    importUrl: string | null,
  ): Promise<ApiResult<ChannelLink>> {
    return this.client.post("/api/channels/links", { roomId, channel, importUrl })
  }

  updateChannelUrl(id: string, importUrl: string | null): Promise<ApiResult<ChannelLink>> {
    return this.client.patch(`/api/channels/links/${id}`, { importUrl })
  }

  rotateChannel(id: string): Promise<ApiResult<ChannelLink>> {
    return this.client.post(`/api/channels/links/${id}/rotate`)
  }

  syncChannel(id: string): Promise<ApiResult<ChannelLink>> {
    return this.client.post(`/api/channels/links/${id}/sync`)
  }

  unlinkChannel(id: string): Promise<ApiResult<void>> {
    return this.client.delete(`/api/channels/links/${id}`)
  }

  /** The `.ics` address an OTA pulls. */
  calendarExportUrl(exportToken: string): string {
    return this.client.url(`/api/public/calendar/${exportToken}.ics`)
  }
}
