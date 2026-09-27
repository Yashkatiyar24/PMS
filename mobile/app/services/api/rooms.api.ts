import type {
  BulkRoomsInput,
  HousekeepingInput,
  Person,
  Room,
  RoomInput,
  RoomType,
  RoomTypeInput,
  StatusInput,
} from "@/features/rooms/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/rooms`, `/api/room-types`, `/api/beds`, `/api/housekeepers` */
export class RoomsApi {
  constructor(private readonly client: ApiClient) {}

  roomTypes(): Promise<ApiResult<RoomType[]>> {
    return this.client.get("/api/room-types")
  }

  createRoomType(body: RoomTypeInput): Promise<ApiResult<RoomType>> {
    return this.client.post("/api/room-types", body)
  }

  updateRoomType(id: string, body: RoomTypeInput): Promise<ApiResult<RoomType>> {
    return this.client.put(`/api/room-types/${id}`, body)
  }

  rooms(): Promise<ApiResult<Room[]>> {
    return this.client.get("/api/rooms")
  }

  room(id: string): Promise<ApiResult<Room>> {
    return this.client.get(`/api/rooms/${id}`)
  }

  createRoom(body: RoomInput): Promise<ApiResult<Room>> {
    return this.client.post("/api/rooms", body)
  }

  createRoomsBulk(body: BulkRoomsInput): Promise<ApiResult<Room[]>> {
    return this.client.post("/api/rooms/bulk", body)
  }

  updateRoom(id: string, body: RoomInput): Promise<ApiResult<Room>> {
    return this.client.put(`/api/rooms/${id}`, body)
  }

  setStatus(id: string, body: StatusInput): Promise<ApiResult<Room>> {
    return this.client.patch(`/api/rooms/${id}/status`, body)
  }

  setHousekeeping(id: string, body: HousekeepingInput): Promise<ApiResult<Room>> {
    return this.client.patch(`/api/rooms/${id}/housekeeping`, body)
  }

  housekeepers(): Promise<ApiResult<Person[]>> {
    return this.client.get("/api/housekeepers")
  }

  addBed(roomId: string, label: string | null): Promise<ApiResult<Room>> {
    return this.client.post(`/api/rooms/${roomId}/beds`, { label })
  }

  setBedActive(bedId: string, active: boolean): Promise<ApiResult<Room>> {
    return this.client.patch(`/api/beds/${bedId}`, { active })
  }
}
