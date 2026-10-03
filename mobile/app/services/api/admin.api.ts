import type {
  ActivityRow,
  NewPropertyInput,
  NewPropertyResult,
  Plan,
  PropertyHealth,
  TeamMember,
} from "@/features/admin/types"
import type { BillingStatus } from "@/features/auth/types"

import type { ApiClient, UploadFile } from "./client"
import type { ApiResult } from "./result"

/** `/api/admin/**` — the platform back office, super admins only. */
export class AdminApi {
  constructor(private readonly client: ApiClient) {}

  properties(): Promise<ApiResult<PropertyHealth[]>> {
    return this.client.get("/api/admin/properties")
  }
  property(id: string): Promise<ApiResult<PropertyHealth>> {
    return this.client.get(`/api/admin/properties/${id}`)
  }
  team(id: string): Promise<ApiResult<TeamMember[]>> {
    return this.client.get(`/api/admin/properties/${id}/team`)
  }
  activity(id: string): Promise<ApiResult<ActivityRow[]>> {
    return this.client.get(`/api/admin/properties/${id}/activity`)
  }
  plans(): Promise<ApiResult<Plan[]>> {
    return this.client.get("/api/admin/plans")
  }
  onboard(body: NewPropertyInput): Promise<ApiResult<NewPropertyResult>> {
    return this.client.post("/api/admin/properties", body)
  }
  uploadPhoto(id: string, file: UploadFile): Promise<ApiResult<PropertyHealth>> {
    return this.client.upload(`/api/admin/properties/${id}/photo`, file)
  }
  removePhoto(id: string): Promise<ApiResult<PropertyHealth>> {
    return this.client.delete(`/api/admin/properties/${id}/photo`)
  }
  setActive(id: string, active: boolean): Promise<ApiResult<PropertyHealth>> {
    return this.client.patch(`/api/admin/properties/${id}/active`, { active })
  }
  setNotes(id: string, notes: string): Promise<ApiResult<PropertyHealth>> {
    return this.client.patch(`/api/admin/properties/${id}/notes`, { notes })
  }
  setModules(id: string, modules: string[]): Promise<ApiResult<void>> {
    return this.client.patch(`/api/admin/properties/${id}/modules`, { modules })
  }
  resetPassword(
    id: string,
    userId: string,
  ): Promise<ApiResult<{ name: string; email: string; password: string }>> {
    return this.client.post(`/api/admin/properties/${id}/team/${userId}/password`)
  }
  setBilling(orgId: string, billingStatus: BillingStatus): Promise<ApiResult<void>> {
    return this.client.patch(`/api/admin/organisations/${orgId}/billing`, { billingStatus })
  }
  setPlan(orgId: string, planCode: string): Promise<ApiResult<void>> {
    return this.client.patch(`/api/admin/organisations/${orgId}/plan`, { planCode })
  }
}
