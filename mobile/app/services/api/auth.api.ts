import type {
  ChangePasswordRequest,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  OtpVerifyRequest,
  SessionView,
} from "@/features/auth/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/auth/**` and the password endpoints. */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  login(body: LoginRequest): Promise<ApiResult<{ body: LoginResponse; token: string | null }>> {
    return this.client.login<LoginResponse>("/api/auth/login", body)
  }

  sendOtp(target: string): Promise<ApiResult<{ status: string }>> {
    return this.client.post("/api/auth/otp/send", { target })
  }

  verifyOtp(
    body: OtpVerifyRequest,
  ): Promise<ApiResult<{ body: LoginResponse; token: string | null }>> {
    return this.client.login<LoginResponse>("/api/auth/otp/verify", body)
  }

  /**
   * A cheap call that wakes a sleeping server and its database. The login screen fires it as it opens, so the
   * cold start runs while the person types rather than after they tap Sign in.
   */
  health(): Promise<ApiResult<{ status: string }>> {
    return this.client.get("/api/health")
  }

  me(): Promise<ApiResult<CurrentUser>> {
    return this.client.get("/api/auth/me")
  }

  switchProperty(propertyId: string): Promise<ApiResult<void>> {
    return this.client.post("/api/auth/switch-property", { propertyId })
  }

  logout(): Promise<ApiResult<void>> {
    return this.client.post("/api/auth/logout")
  }

  sessions(): Promise<ApiResult<SessionView[]>> {
    return this.client.get("/api/auth/sessions")
  }

  revokeSession(id: string): Promise<ApiResult<void>> {
    return this.client.delete(`/api/auth/sessions/${id}`)
  }

  changeMyPassword(body: ChangePasswordRequest): Promise<ApiResult<void>> {
    return this.client.post("/api/users/me/password", body)
  }
}
