/**
 * The guest's phone talking to the backend, with no account and no session.
 *
 * Kept apart from `api.ts` on purpose. That client sends the session cookie, treats a 401 as "you have been
 * signed out" and pushes the browser to the login screen — all correct for the desk, all wrong for a guest,
 * who has no login to go back to. Nothing here sends credentials or redirects anywhere.
 */
import { API_BASE } from "./api"

export class PublicApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const problem = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new PublicApiError(res.status, problem.error ?? `HTTP ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export async function getForm<T>(token: string): Promise<T> {
  return unwrap<T>(await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}`))
}

export async function submitForm<T>(token: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

export async function uploadPhoto(token: string, photo: Blob): Promise<void> {
  const form = new FormData()
  form.append("file", photo, "id.jpg")
  await unwrap<unknown>(
    await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}/photo`, {
      method: "POST",
      body: form,
    }),
  )
}

/* ---------------------------------------------------------------- the property's booking page */

export type BookingPage = {
  name: string
  city: string
  address: string
  phone: string
  checkinTime: string
  checkoutTime: string
  today: string
  maxNights: number
  daysAhead: number
  consentRequired: boolean
  consentText: Record<string, string>
  /** Whether the guest pays online when booking, and how much of the stay. */
  payment: "off" | "optional" | "required"
  advancePct: number
  /** A short-lived link to the property's photograph, or null when it has none. */
  photoUrl: string | null
}
/** What opens the payment gateway's checkout. The key is the public one. */
export type Checkout = { provider: "razorpay" | "console"; keyId: string; orderId: string; amountPaise: number; currency: string; name: string; holdUntil: string | null }
export type Offer = { roomTypeId: string; name: string; maxOccupancy: number; dormitory: boolean; ratePaise: number; free: number; nights: number; totalPaise: number }
export type Confirmation = {
  reference: string
  guestName: string
  propertyName: string
  propertyPhone: string
  roomType: string
  arrive: string
  depart: string
  nights: number
  totalPaise: number
  checkinTime: string
  /** "pending" while an online payment is awaited; "reserved" once confirmed. */
  status: string
  paidPaise: number
  payment: Checkout | null
  /** The guest's link to this stay. Returned once, when the booking is made, and never again. */
  stayUrl: string | null
}

const book = (slug: string) => `${API_BASE}/api/public/book/${encodeURIComponent(slug)}`

export async function getBookingPage(slug: string): Promise<BookingPage> {
  return unwrap(await fetch(book(slug)))
}

export async function getOffers(slug: string, arrive: string, depart: string): Promise<Offer[]> {
  return unwrap(await fetch(`${book(slug)}/availability?arrive=${arrive}&depart=${depart}`))
}

export async function bookOnline(slug: string, body: unknown): Promise<Confirmation> {
  return unwrap(await fetch(book(slug), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
}

const post = async <T>(url: string, body: unknown): Promise<T> =>
  unwrap<T>(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

/** The gateway's success fields, which the server checks with its own secret before believing anything. */
export const verifyPayment = (slug: string, body: { orderId: string; paymentId: string; signature: string }) => post<Confirmation>(`${book(slug)}/payments/verify`, body)
export const reportPaymentFailure = (slug: string, orderId: string, reason: string) => post<void>(`${book(slug)}/payments/failed`, { orderId, reason })
export const retryPayment = (slug: string, orderId: string) => post<Checkout>(`${book(slug)}/payments/retry`, { orderId })
/** Development only: stands in for the gateway's own window. */
export const simulatePayment = (slug: string, orderId: string, succeed: boolean) =>
  post<{ orderId: string; paymentId: string; signature: string }>(`${book(slug)}/payments/simulate`, { orderId, succeed })

/* ---------------------------------------------------------------- the guest's own stay */

/** One receipt the guest may download; `url` is short-lived and null until the PDF exists. */
export type StayBill = { number: string; kind: string; issuedAt: string; amountPaise: number; amount: string; url: string | null }
/**
 * What the guest's phone is told about their own stay. Deliberately free of ids: there is no property id,
 * no booking id and nothing about anybody else, so a leaked link reveals one stay and can change nothing.
 */
export type StayView = {
  propertyName: string
  propertyPhone: string
  propertyAddress: string
  language: "hi" | "en"
  reference: string
  guestName: string
  status: string
  arrive: string
  depart: string
  nights: number
  checkinTime: string
  checkoutTime: string
  roomType: string
  /** Room numbers, once the guest is actually in them; empty before arrival. */
  rooms: string
  adults: number
  children: number
  totalPaise: number
  /** Money held as a deposit, not a charge. Shown on its own line so the totals add up. */
  depositPaise: number
  paidPaise: number
  /** Signed: negative means the property owes the guest a refund. */
  duePaise: number
  total: string
  deposit: string
  paid: string
  /** Always the amount without its sign; read `duePaise` for the direction. */
  due: string
  bills: StayBill[]
}

export async function getStay(token: string): Promise<StayView> {
  return unwrap<StayView>(await fetch(`${API_BASE}/api/public/stay/${encodeURIComponent(token)}`))
}
