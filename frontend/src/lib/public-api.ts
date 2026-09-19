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

export async function uploadPhoto(token: string, file: File): Promise<void> {
  const form = new FormData()
  form.append("file", file)
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
