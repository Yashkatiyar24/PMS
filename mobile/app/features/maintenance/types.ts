export type TicketPriority = "low" | "normal" | "high" | "urgent"
export type TicketStatus = "open" | "assigned" | "in_progress" | "resolved" | "closed"
export const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"]
export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
]

export type Ticket = {
  id: string
  roomId: string | null
  roomNumber: string | null
  issue: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  assignedTo: string | null
  assignedName: string | null
  resolution: string | null
  takesRoomOffSale: boolean
  reportedByName: string
  createdAt: string
  resolvedAt: string | null
}
export type TicketInput = {
  roomId: string | null
  issue: string
  description: string
  priority: TicketPriority
  takesRoomOffSale: boolean
}
export type TicketUpdate = {
  status: TicketStatus
  assignedTo: string | null
  priority: TicketPriority
  resolution: string | null
}

export type LostStatus = "held" | "returned" | "disposed"
export const LOST_STATUSES: LostStatus[] = ["held", "returned", "disposed"]
export type LostItem = {
  id: string
  roomId: string | null
  roomNumber: string | null
  description: string
  foundAt: string
  foundByName: string
  status: LostStatus
  returnedTo: string | null
  notes: string
}
export type LostItemInput = { roomId: string | null; description: string; notes: string }
export type LostItemUpdate = { status: LostStatus; returnedTo: string | null; notes: string | null }
