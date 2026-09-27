import type {
  LostItem,
  LostItemInput,
  LostItemUpdate,
  Ticket,
  TicketInput,
  TicketUpdate,
} from "@/features/maintenance/types"
import type { Person } from "@/features/rooms/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/maintenance/**` and `/api/lost-found/**` */
export class MaintenanceApi {
  constructor(private readonly client: ApiClient) {}

  tickets(all: boolean): Promise<ApiResult<Ticket[]>> {
    return this.client.get("/api/maintenance", { all })
  }

  report(body: TicketInput): Promise<ApiResult<Ticket>> {
    return this.client.post("/api/maintenance", body)
  }

  update(id: string, body: TicketUpdate): Promise<ApiResult<Ticket>> {
    return this.client.patch(`/api/maintenance/${id}`, body)
  }

  technicians(): Promise<ApiResult<Person[]>> {
    return this.client.get("/api/maintenance/technicians")
  }

  lostItems(): Promise<ApiResult<LostItem[]>> {
    return this.client.get("/api/lost-found")
  }

  addLostItem(body: LostItemInput): Promise<ApiResult<LostItem>> {
    return this.client.post("/api/lost-found", body)
  }

  updateLostItem(id: string, body: LostItemUpdate): Promise<ApiResult<LostItem>> {
    return this.client.patch(`/api/lost-found/${id}`, body)
  }
}
