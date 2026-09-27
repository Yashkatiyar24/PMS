import type {
  Activity,
  Approval,
  Booking,
  CheckInRequest,
  CheckOutInput,
  DetailsInput,
  FreeUnit,
  Member,
  MoveInput,
  ReasonInput,
  ReservationRequest,
  SearchHit,
  TapeChart,
  Today,
  UnitRequest,
} from "@/features/bookings/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/bookings/**` */
export class BookingsApi {
  constructor(private readonly client: ApiClient) {}

  today(): Promise<ApiResult<Today>> {
    return this.client.get("/api/bookings/today")
  }

  tapeChart(start?: string, days?: number): Promise<ApiResult<TapeChart>> {
    return this.client.get("/api/bookings/tape-chart", { start, days })
  }

  search(q: string): Promise<ApiResult<SearchHit[]>> {
    return this.client.get("/api/bookings/search", { q })
  }

  availability(arriveAt: string, departAt: string): Promise<ApiResult<FreeUnit[]>> {
    return this.client.get("/api/bookings/availability", { arrive: arriveAt, depart: departAt })
  }

  get(id: string): Promise<ApiResult<Booking>> {
    return this.client.get(`/api/bookings/${id}`)
  }

  activity(id: string): Promise<ApiResult<Activity[]>> {
    return this.client.get(`/api/bookings/${id}/activity`)
  }

  /** Walk-in check-in. Idempotent on `clientUuid`; the caller may queue it offline. */
  checkIn(body: CheckInRequest): Promise<ApiResult<Booking>> {
    return this.client.post("/api/bookings/check-in", body)
  }

  reserve(body: ReservationRequest): Promise<ApiResult<Booking>> {
    return this.client.post("/api/bookings/reserve", body)
  }

  arrive(id: string): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/arrive`)
  }

  checkOut(id: string, body: CheckOutInput): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/check-out`, body)
  }

  confirm(id: string): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/confirm`)
  }

  cancel(id: string, body: ReasonInput): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/cancel`, body)
  }

  noShow(id: string, body: Approval): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/no-show`, body)
  }

  move(id: string, body: MoveInput): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/move`, body)
  }

  updateDetails(id: string, body: DetailsInput): Promise<ApiResult<Booking>> {
    return this.client.patch(`/api/bookings/${id}`, body)
  }

  changeDates(id: string, departAt: string, approval: Approval): Promise<ApiResult<Booking>> {
    return this.client.patch(`/api/bookings/${id}/dates`, { departAt, ...approval })
  }

  addUnit(id: string, unit: UnitRequest): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/units`, unit)
  }

  changeUnit(
    id: string,
    unitId: string,
    target: UnitRequest,
    approval: Approval,
  ): Promise<ApiResult<Booking>> {
    return this.client.patch(`/api/bookings/${id}/units/${unitId}`, { target, ...approval })
  }

  releaseUnit(id: string, unitId: string, approval: Approval): Promise<ApiResult<Booking>> {
    return this.client.post(`/api/bookings/${id}/units/${unitId}/release`, approval)
  }

  setMembers(id: string, members: Member[]): Promise<ApiResult<Booking>> {
    return this.client.put(`/api/bookings/${id}/members`, members)
  }
}
