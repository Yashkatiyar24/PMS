import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isPublicScreen } from "@/lib/public-screens"

/**
 * An optimistic check only: if there is no session cookie, send the browser to the login screen instead of
 * loading a screen that will fail. It never decides what a user may do; the API checks the session and the
 * role on every request. (Next.js 16 renamed middleware to proxy.)
 *
 * It also keeps the platform's own back office on its own hostname — see {@link adminHost}.
 */

/**
 * The hostname the platform back office answers on, e.g. {@code admin.padav.in}. One deployment serves both
 * it and the property app; this splits them by the host the browser asked for.
 *
 * <p>Unset — in development, and on any deployment that has not been given the domain — nothing changes and
 * {@code /admin} stays where it has always been. That is deliberate: the current deployment must keep
 * working, and a missing environment variable must not take the back office offline.
 *
 * <p>This is separation, not the security boundary. The back office is guarded by the API, which checks
 * {@code SUPER_ADMIN} on every {@code /api/admin} request whatever hostname asked. Splitting the hosts means
 * a property's staff never see a door they cannot open, and the two sessions stay apart: the cookie carries
 * no Domain, so signing in to the app does not sign you in to the back office.
 */
const adminHost = process.env.PMS_ADMIN_HOST?.trim().toLowerCase()

const isAdminScreen = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/")

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // A file (hero.jpg, an icon) is not a screen: it carries no data and must load on the login page itself.
  const isFile = /\.\w+$/.test(pathname)

  if (adminHost && !isFile) {
    // The host header, without any port: a browser sends "admin.padav.in", a proxy in front may add ":443".
    const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase()
    const onAdminHost = host === adminHost

    // The back office hostname serves the back office and the sign-in form, and nothing else. Someone who
    // lands on it with a property URL is sent to the front door rather than shown the desk app.
    if (onAdminHost && !isAdminScreen(pathname) && !pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }
    // On every other hostname the back office is simply not there. The API would refuse it anyway; this
    // stops it being a visible door on the property's own domain. Sent home rather than shown an error,
    // because the person who followed an old bookmark is staff with somewhere to be.
    if (!onAdminHost && isAdminScreen(pathname)) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  if (isPublicScreen(pathname) || isFile) return NextResponse.next()

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
