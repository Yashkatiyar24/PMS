import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isPublicScreen } from "@/lib/public-screens"

/**
 * An optimistic check only: if there is no session cookie, send the browser to the login screen instead of
 * loading a screen that will fail. It never decides what a user may do; the API checks the session and the
 * role on every request. (Next.js 16 renamed middleware to proxy.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicScreen(pathname)) return NextResponse.next()
  // A file (hero.jpg, an icon) is not a screen: it carries no data and must load on the login page itself.
  if (/\.\w+$/.test(pathname)) return NextResponse.next()

  if (!request.cookies.has("pms_session")) {
    // Someone bounced here came to sign in, not to read the landing page: open the form for them.
    const login = new URL("/login?signin=1", request.url)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

// "api/" is the backend, passed through when deployed (next.config.ts); it checks the session itself, and signing
// in or a guest's booking must reach it without a cookie.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon-.*\\.png).*)"],
}
