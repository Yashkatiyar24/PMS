/**
 * The session token. The backend sets it as an HttpOnly cookie named `pms_session`; the app reads it from the
 * login response's `Set-Cookie` header, keeps it in the encrypted store and sends it back as a `Cookie` header.
 * In a browser (the web build) the page can neither read nor send that cookie: the browser keeps it, and the
 * app only remembers that it is signed in.
 */
import { Platform } from "react-native"

import { loadSecure, saveSecure } from "./storage"

export const SESSION_COOKIE = "pms_session"
const TOKEN_KEY = "session.token"
const CODE_KEY = "login.propertyCode"

/** Stands in for the token where the browser holds the cookie itself. */
export const BROWSER_SESSION = "browser-session"

/** Whether the platform's HTTP stack owns the session cookie (a browser) rather than the app. */
export function cookieOwnedByPlatform(os: string = Platform.OS): boolean {
  return os === "web"
}

/** Pull the session token out of one or more `Set-Cookie` header values; null when none carries it. */
export function tokenFromSetCookie(header: string | string[] | null | undefined): string | null {
  if (!header) return null
  const joined = Array.isArray(header) ? header.join(", ") : header
  const m = joined.match(new RegExp(`(?:^|[;,]\\s*)${SESSION_COOKIE}=([^;,\\s]*)`))
  return m && m[1] !== "" ? m[1] : null
}

/** The `Cookie` header for a request, or null when signed out. */
export function cookieHeader(token: string | null): string | null {
  return token && token !== BROWSER_SESSION ? `${SESSION_COOKIE}=${token}` : null
}

export function loadToken(): string | null {
  return loadSecure(TOKEN_KEY)
}

export function saveToken(token: string | null): void {
  saveSecure(TOKEN_KEY, token)
}

export function clearToken(): void {
  saveSecure(TOKEN_KEY, null)
}

/** The property code used last time, so the desk does not retype it. */
export function loadRememberedCode(): string {
  return loadSecure(CODE_KEY) ?? ""
}

export function rememberCode(code: string): void {
  saveSecure(CODE_KEY, normaliseCode(code))
}

/** Property codes are letters and digits, case-insensitive: "srd-1001" → "SRD1001". */
export function normaliseCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

/** What the login form needs before the button is enabled, as on the web. */
export function canSubmitPasswordLogin(code: string, email: string, password: string): boolean {
  const c = normaliseCode(code)
  return (c.length === 0 || c.length >= 4) && email.includes("@") && password.length > 0
}
