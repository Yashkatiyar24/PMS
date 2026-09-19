import type { NextConfig } from "next"

// Deployed (Vercel or anywhere else), PMS_API_ORIGIN names where the Spring Boot API runs. The browser then calls
// /api on the app's own domain and the host passes it on, so the session cookie belongs to the app's domain, where
// the login gate in src/proxy.ts can see it. Unset, as in development, the browser calls the API directly.
const apiOrigin = process.env.PMS_API_ORIGIN?.replace(/\/+$/, "")

const nextConfig: NextConfig = apiOrigin
  ? {
      env: { NEXT_PUBLIC_API_BASE: "" },
      rewrites: async () => [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
    }
  : {}

export default nextConfig
