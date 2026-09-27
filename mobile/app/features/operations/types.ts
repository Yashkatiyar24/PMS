/** Restaurant, stock, expenses, audit: the optional modules. */

export type MenuItem = {
  id: string
  name: string
  category: string
  pricePaise: number
  active: boolean
  sortOrder: number
}
export type MenuInput = Omit<MenuItem, "id">
export type OrderLine = {
  id?: string
  menuItemId: string | null
  name: string
  qty: number
  unitPaise: number
}
export type OrderLineInput = {
  menuItemId: string | null
  name: string | null
  unitPaise: number | null
  qty: number
}
export type OrderStatus = "open" | "posted" | "paid" | "cancelled"
export type Order = {
  id: string
  bookingId: string | null
  guestName: string | null
  units: string | null
  tableLabel: string | null
  status: OrderStatus
  taxablePaise: number
  taxRateBp: number
  totalPaise: number
  billNumber: string | null
  createdAt: string
  lines: OrderLine[]
}
export type OrderInput = {
  bookingId: string | null
  tableLabel: string | null
  lines: OrderLineInput[]
}

export const STOCK_CATEGORIES = [
  "cleaning",
  "linen",
  "toiletries",
  "food",
  "maintenance",
  "stationery",
] as const
export type StockCategory = (typeof STOCK_CATEGORIES)[number]
export type StockItem = {
  id: string
  name: string
  category: StockCategory
  unit: string
  lowStockThreshold: number
  active: boolean
  onHand: number
  atLaundry: number
  low: boolean
}
export type StockItemInput = {
  name: string
  category: StockCategory
  unit: string
  lowStockThreshold: number
  active: boolean
}
export const MOVEMENT_KINDS = [
  "purchase",
  "consumption",
  "to_laundry",
  "from_laundry",
  "adjustment",
  "opening",
] as const
export type MovementKind = (typeof MOVEMENT_KINDS)[number]
export type Movement = {
  id: string
  kind: MovementKind
  qtyChange: number
  unitCostPaise: number | null
  roomNumber: string | null
  note: string
  byName: string
  at: string
}
export type MovementInput = {
  kind: MovementKind
  qty: number
  unitCostPaise: number | null
  roomId: string | null
  note: string
}

export const EXPENSE_CATEGORIES = [
  "utilities",
  "maintenance",
  "salaries",
  "cleaning",
  "supplies",
  "food",
  "marketing",
  "other",
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export const EXPENSE_MODES = ["cash", "upi", "card", "bank", "cheque"] as const
export type Expense = {
  id: string
  spentOn: string
  category: ExpenseCategory
  amountPaise: number
  vendor: string
  paymentMode: string
  description: string
  hasReceipt: boolean
  voidedAt: string | null
  voidReason: string | null
  createdByName: string
}
export type ExpenseInput = {
  spentOn: string
  category: ExpenseCategory
  amountPaise: number
  vendor: string
  paymentMode: string
  description: string
}
export type ExpenseSummary = {
  from: string
  to: string
  totalPaise: number
  byCategory: Record<string, number>
  expenses: Expense[]
}

export type AuditEntry = {
  id: string
  at: string
  userName: string | null
  table: string
  rowId: string
  action: string
  before: string | null
  after: string | null
}
