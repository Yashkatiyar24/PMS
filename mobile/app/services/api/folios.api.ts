import type { Approval } from "@/features/bookings/types"
import type {
  CreditNoteRequest,
  Folio,
  LineRequest,
  PaymentInput,
  Receipt,
  RefundRequest,
} from "@/features/folio/types"

import type { ApiClient } from "./client"
import type { ApiResult } from "./result"

/** `/api/folios/**` and `/api/receipts/**` */
export class FoliosApi {
  constructor(private readonly client: ApiClient) {}

  get(id: string): Promise<ApiResult<Folio>> {
    return this.client.get(`/api/folios/${id}`)
  }

  byBooking(bookingId: string): Promise<ApiResult<Folio>> {
    return this.client.get(`/api/folios/by-booking/${bookingId}`)
  }

  addLine(id: string, body: LineRequest): Promise<ApiResult<Folio>> {
    return this.client.post(`/api/folios/${id}/lines`, body)
  }

  removeLine(
    id: string,
    lineId: string,
    reason: string,
    approval: Approval,
  ): Promise<ApiResult<Folio>> {
    return this.client.delete(`/api/folios/${id}/lines/${lineId}`, { reason, ...approval })
  }

  /** Idempotent on `clientUuid`; the caller may queue it offline. */
  pay(id: string, body: PaymentInput): Promise<ApiResult<Folio>> {
    return this.client.post(`/api/folios/${id}/payments`, body)
  }

  refund(id: string, body: RefundRequest): Promise<ApiResult<Folio>> {
    return this.client.post(`/api/folios/${id}/refunds`, body)
  }

  receipts(id: string): Promise<ApiResult<Receipt[]>> {
    return this.client.get(`/api/folios/${id}/receipts`)
  }

  issueInvoice(id: string): Promise<ApiResult<Receipt>> {
    return this.client.post(`/api/folios/${id}/receipts/invoice`)
  }

  issueProvisional(id: string, amountPaise: number): Promise<ApiResult<Receipt>> {
    return this.client.post(`/api/folios/${id}/receipts/provisional`, undefined, { amountPaise })
  }

  creditNote(receiptId: string, body: CreditNoteRequest): Promise<ApiResult<Receipt>> {
    return this.client.post(`/api/folios/receipts/${receiptId}/credit-note`, body)
  }

  /** The path the ReceiptViewer loads for a receipt. */
  receiptHtmlPath(receiptId: string): string {
    return `/api/receipts/${receiptId}/html`
  }
}
