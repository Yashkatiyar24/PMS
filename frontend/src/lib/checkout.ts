/**
 * Opens Razorpay's own checkout window and reports what the guest did in it. The result is only a claim: the
 * server checks the signature with its secret and asks Razorpay before a booking is confirmed.
 */
import type { Checkout } from "./public-api"

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type RazorpayFailure = { error?: { description?: string } }
type RazorpayInstance = { open: () => void; on: (event: "payment.failed", cb: (r: RazorpayFailure) => void) => void }
declare global {
  interface Window { Razorpay?: new (options: object) => RazorpayInstance }
}

export type CheckoutResult =
  | { kind: "paid"; orderId: string; paymentId: string; signature: string }
  | { kind: "failed"; reason: string }
  | { kind: "closed" }

let loading: Promise<void> | null = null

function load(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve()
    script.onerror = () => { loading = null; reject(new Error("The payment page could not be opened")) }
    document.head.appendChild(script)
  })
  return loading
}

export async function openRazorpay(checkout: Checkout, prefill: { name: string; contact: string }, description: string): Promise<CheckoutResult> {
  await load()
  return new Promise<CheckoutResult>((resolve) => {
    let settled = false
    // A failed attempt does not end the checkout: Razorpay lets the guest try again in the same window, on the
    // same order. The failure is remembered and reported only if they then close the window without paying.
    let lastFailure: string | null = null
    const done = (r: CheckoutResult) => { if (!settled) { settled = true; resolve(r) } }
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: checkout.name,
      description,
      prefill,
      handler: (r: RazorpayResponse) => done({ kind: "paid", orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => done(lastFailure ? { kind: "failed", reason: lastFailure } : { kind: "closed" }) },
    })
    rzp.on("payment.failed", (r) => { lastFailure = r.error?.description ?? "Payment failed" })
    rzp.open()
  })
}
