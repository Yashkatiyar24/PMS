import type {
  Guest,
  GuestInput,
  GuestProfile,
  NewLink,
  Registration,
} from "@/features/guests/types"

import type { ApiClient, UploadFile } from "./client"
import type { ApiResult } from "./result"

/** `/api/guests/**` and the desk side of self-registration `/api/registrations/**`. */
export class GuestsApi {
  constructor(private readonly client: ApiClient) {}

  byPhone(phone: string): Promise<ApiResult<Guest[]>> {
    return this.client.get("/api/guests", { phone })
  }

  search(q: string): Promise<ApiResult<Guest[]>> {
    return this.client.get("/api/guests", { q })
  }

  get(id: string): Promise<ApiResult<Guest>> {
    return this.client.get(`/api/guests/${id}`)
  }

  profile(id: string): Promise<ApiResult<GuestProfile>> {
    return this.client.get(`/api/guests/${id}/profile`)
  }

  create(body: GuestInput): Promise<ApiResult<Guest>> {
    return this.client.post("/api/guests", body)
  }

  update(id: string, body: GuestInput): Promise<ApiResult<Guest>> {
    return this.client.put(`/api/guests/${id}`, body)
  }

  uploadIdPhoto(id: string, file: UploadFile): Promise<ApiResult<Guest>> {
    return this.client.upload(`/api/guests/${id}/id-photo`, file)
  }

  idPhotoUrl(id: string): Promise<ApiResult<{ url: string }>> {
    return this.client.get(`/api/guests/${id}/id-photo-url`)
  }

  uploadPhoto(id: string, file: UploadFile): Promise<ApiResult<Guest>> {
    return this.client.upload(`/api/guests/${id}/photo`, file)
  }

  photoUrl(id: string): Promise<ApiResult<{ url: string }>> {
    return this.client.get(`/api/guests/${id}/photo-url`)
  }

  createRegistration(bookingId: string | null): Promise<ApiResult<NewLink>> {
    return this.client.post("/api/registrations", { bookingId })
  }

  registration(id: string): Promise<ApiResult<Registration>> {
    return this.client.get(`/api/registrations/${id}`)
  }

  /** Turn the guest's submission into a guest record; `corrected` is the desk's edited copy, or null to keep theirs. */
  applyRegistration(
    id: string,
    corrected: GuestInput | null,
  ): Promise<ApiResult<{ guestId: string }>> {
    return this.client.post(`/api/registrations/${id}/apply`, corrected ?? {})
  }

  revokeRegistration(id: string): Promise<ApiResult<Registration>> {
    return this.client.post(`/api/registrations/${id}/revoke`)
  }
}
