/** Form validation. The only file that imports zod; forms take schemas from here. */
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ZodType } from "zod"

export { z }

/** Ten-digit Indian mobile, or empty. */
export const phoneSchema = z
  .string()
  .refine((v) => v === "" || /^\d{10}$/.test(v.replace(/\D/g, "")), {
    message: "validation.phone",
  })

/** A required 10-digit mobile. */
export const requiredPhoneSchema = z.string().refine((v) => /^\d{10}$/.test(v.replace(/\D/g, "")), {
  message: "validation.phone",
})

export const emailSchema = z.string().trim().email({ message: "validation.email" })

/** A non-empty trimmed string. */
export const requiredText = z.string().trim().min(1, { message: "validation.required" })

/** Exactly four digits (the last 4 of an ID), or empty. */
export const idLast4Schema = z.string().refine((v) => v === "" || /^[0-9A-Za-z]{4}$/.test(v), {
  message: "validation.last4",
})

/** A 4–6 digit approval PIN. */
export const pinSchema = z.string().regex(/^\d{4,6}$/, { message: "validation.pin" })

/** A password of at least 8 characters. */
export const passwordSchema = z.string().min(8, { message: "validation.password" })

/** Rupees typed into a money field: digits with an optional decimal part. */
export const moneyTextSchema = z
  .string()
  .refine((v) => v === "" || /^\d{1,9}(\.\d{0,2})?$/.test(v.replace(/,/g, "")), {
    message: "validation.money",
  })

/** A property code: 4–12 letters or digits, or empty for the platform admin. */
export const propertyCodeSchema = z.string().refine((v) => v === "" || /^[A-Z0-9]{4,12}$/.test(v), {
  message: "validation.code",
})

/** A 15-character GSTIN, or empty. */
export const gstinSchema = z.string().refine((v) => v === "" || /^[0-9A-Z]{15}$/.test(v), {
  message: "validation.gstin",
})

/** Turn a schema into a react-hook-form resolver. */
export function resolverFor<T extends Record<string, unknown>>(schema: ZodType<T>) {
  return zodResolver(schema as Parameters<typeof zodResolver>[0])
}

/** Parse and return either the value or the first message. */
export function check<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; value: T } | { ok: false; message: string } {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, message: result.error.issues[0]?.message ?? "validation.invalid" }
}

/** True when the text contains a 12-digit run: a full Aadhaar number, which must never be stored. */
export function looksLikeFullAadhaar(text: string): boolean {
  return /\d{12}/.test(text.replace(/\s/g, ""))
}
