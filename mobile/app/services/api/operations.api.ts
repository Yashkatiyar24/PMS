import type {
  AuditEntry,
  Expense,
  ExpenseInput,
  ExpenseSummary,
  MenuInput,
  MenuItem,
  Movement,
  MovementInput,
  Order,
  OrderInput,
  OrderLineInput,
  StockItem,
  StockItemInput,
} from "@/features/operations/types"

import type { ApiClient, UploadFile } from "./client"
import type { ApiResult } from "./result"

/** `/api/restaurant/**`, `/api/inventory/**`, `/api/expenses/**`, `/api/audit/**` */
export class OperationsApi {
  constructor(private readonly client: ApiClient) {}

  menu(): Promise<ApiResult<MenuItem[]>> {
    return this.client.get("/api/restaurant/menu")
  }
  addDish(body: MenuInput): Promise<ApiResult<MenuItem>> {
    return this.client.post("/api/restaurant/menu", body)
  }
  updateDish(id: string, body: MenuInput): Promise<ApiResult<MenuItem>> {
    return this.client.put(`/api/restaurant/menu/${id}`, body)
  }
  orders(all: boolean): Promise<ApiResult<Order[]>> {
    return this.client.get("/api/restaurant/orders", { all })
  }
  createOrder(body: OrderInput): Promise<ApiResult<Order>> {
    return this.client.post("/api/restaurant/orders", body)
  }
  setOrderLines(id: string, lines: OrderLineInput[]): Promise<ApiResult<Order>> {
    return this.client.put(`/api/restaurant/orders/${id}/lines`, { lines })
  }
  postOrder(id: string, bookingId: string | null): Promise<ApiResult<Order>> {
    return this.client.post(`/api/restaurant/orders/${id}/post`, { bookingId })
  }
  payOrder(id: string, mode: string): Promise<ApiResult<Order>> {
    return this.client.post(`/api/restaurant/orders/${id}/pay`, { mode, reference: "" })
  }
  cancelOrder(id: string, reason: string): Promise<ApiResult<Order>> {
    return this.client.post(`/api/restaurant/orders/${id}/cancel`, { reason })
  }
  billPath(orderId: string): string {
    return `/api/restaurant/orders/${orderId}/bill`
  }

  stockItems(): Promise<ApiResult<StockItem[]>> {
    return this.client.get("/api/inventory/items")
  }
  addStockItem(body: StockItemInput): Promise<ApiResult<StockItem>> {
    return this.client.post("/api/inventory/items", body)
  }
  updateStockItem(id: string, body: StockItemInput): Promise<ApiResult<StockItem>> {
    return this.client.put(`/api/inventory/items/${id}`, body)
  }
  movements(itemId: string): Promise<ApiResult<Movement[]>> {
    return this.client.get(`/api/inventory/items/${itemId}/movements`)
  }
  addMovement(itemId: string, body: MovementInput): Promise<ApiResult<StockItem>> {
    return this.client.post(`/api/inventory/items/${itemId}/movements`, body)
  }

  expenses(from: string, to: string): Promise<ApiResult<ExpenseSummary>> {
    return this.client.get("/api/expenses", { from, to })
  }
  addExpense(body: ExpenseInput): Promise<ApiResult<Expense>> {
    return this.client.post("/api/expenses", body)
  }
  voidExpense(id: string, reason: string): Promise<ApiResult<Expense>> {
    return this.client.post(`/api/expenses/${id}/void`, { reason })
  }
  uploadExpenseReceipt(id: string, file: UploadFile): Promise<ApiResult<Expense>> {
    return this.client.upload(`/api/expenses/${id}/receipt`, file)
  }
  expenseReceiptUrl(id: string): Promise<ApiResult<{ url: string }>> {
    return this.client.get(`/api/expenses/${id}/receipt-url`)
  }

  auditTables(): Promise<ApiResult<string[]>> {
    return this.client.get("/api/audit/tables")
  }
  audit(
    from: string,
    to: string,
    table: string | null,
    q: string | null,
  ): Promise<ApiResult<AuditEntry[]>> {
    return this.client.get("/api/audit", { from, to, table: table || undefined, q: q || undefined })
  }
}
