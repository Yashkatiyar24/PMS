import type { NextConfig } from "next"

// Deployed (Vercel or anywhere else), PMS_API_ORIGIN names where the Spring Boot API runs. The browser then calls
// /api on the app's own domain and the host passes it on, so the session cookie belongs to the app's domain, where
// the login gate in src/proxy.ts can see it. Unset, as in development, the browser calls the API directly.
const apiOrigin = process.env.PMS_API_ORIGIN?.replace(/\/+$/, "")
const production = process.env.NODE_ENV === "production"
if (production && !apiOrigin && !process.env.NEXT_PUBLIC_API_BASE)
  throw new Error("Set PMS_API_ORIGIN (or NEXT_PUBLIC_API_BASE) for a production build; without it the app would call localhost.")

// The desk must not be framed by another site, must not leak signed file links in the Referer, and asks for the
// camera only itself. HSTS is added only to production responses, which are served over HTTPS.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The development badge would otherwise sit on the signed-in person's avatar at the foot of the laptop rail.
  devIndicators: { position: "bottom-right" },
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  ...(apiOrigin
    ? {
        env: { NEXT_PUBLIC_API_BASE: "" },
        rewrites: async () => [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
      }
    : {}),
}

export default nextConfig
