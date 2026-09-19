import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * An optimistic check only: if there is no session cookie, send the browser to the login screen instead of
 * loading a screen that will fail. It never decides what a user may do; the API checks the session and the
 * role on every request. (Next.js 16 renamed middleware to proxy.)
 */
// "/g/" is the guest's own self-registration form, reached by scanning a QR at the desk. Whoever opens it
// has no account and never will, so it must never be bounced to a login screen.
const PUBLIC_PATHS = ["/login", "/g/", "/book/", "/manifest.webmanifest", "/sw.js"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next()

  if (!request.cookies.has("pms_session")) {
    const login = new URL("/login", request.url)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png).*)"],
}
