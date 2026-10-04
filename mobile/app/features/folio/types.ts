import type { Approval } from "@/features/bookings/types"

export type LineKind =
  | "room_charge"
  | "day_use"
  | "extra"
  | "discount"
  | "deposit"
  | "deposit_refund"
  | "forfeit"
  | "adjustment"
export type PaymentMode = "cash" | "upi" | "card" | "bank" | "cheque" | "online"

/** What an extra charge is for. */
export const CHARGE_CATEGORIES = [
  "food",
  "restaurant",
  "laundry",
  "room_service",
  "extra_bed",
  "transport",
  "other",
] as const
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number]

export type FolioLine = {
  id: string
  kind: LineKind
  description: string
  qty: number
  unitPaise: number
  taxRateBp: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  lineDate: string
  auto: boolean
  reason: string | null
  category: string | null
}

export type FolioPayment = {
  id: string
  mode: PaymentMode
  amountPaise: number
  reference: string
  refund: boolean
  reason: string | null
  receivedAt: string
}

export type Folio = {
  id: string
  bookingId: string
  status: "open" | "settled" | "written_off"
  totalPaise: number
  taxPaise: number
  paidPaise: number
  depositHeldPaise: number
  lines: FolioLine[]
  payments: FolioPayment[]
}

export type Receipt = {
  id: string
  folioId: string
  kind: "invoice" | "donation" | "credit_note" | "provisional" | "pos_bill"
  number: string
  fy: string
  amountPaise: number
  issuedAt: string
  pdfKey: string | null
  referencesReceiptId?: string | null
}

export type LineInput = {
  kind: LineKind
  description: string
  qty: number
  unitPaise: number
  lineDate: string | null
  reason: string | null
  category: string | null
}
export type PaymentInput = {
  mode: PaymentMode
  amountPaise: number
  reference: string
  receivedAt: string | null
  reason: string | null
  clientUuid: string
}
export type LineRequest = Approval & { line: LineInput }
export type RefundRequest = Approval & { payment: PaymentInput }
export type CreditNoteRequest = Approval & { amountPaise: number; reason: string }
