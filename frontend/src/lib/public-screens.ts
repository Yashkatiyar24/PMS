/**
 * The screens reachable with no account, in one place.
 *
 * This is asked in four unrelated spots — the proxy deciding whether to bounce a request to the login
 * screen, the API client deciding whether a 401 means "signed out", the app shell deciding whether to draw
 * the desk's navigation around the page, and the service worker deciding whether to install. A route
 * missing from any one of them fails quietly and differently: a guest sent to a login form they can never
 * complete, or a guest's own page wrapped in the desk's chrome.
 *
 * Deliberately free of imports: the proxy runs in its own runtime and must not pull in the API client.
 */

/** A guest's own screens: the self-registration form, their stay, and a property's public booking page. */
export const GUEST_SCREENS = ["/g/", "/s/", "/book/"] as const

/** Those, plus the login screen itself. */
export const PUBLIC_SCREENS = ["/login", ...GUEST_SCREENS] as const

/** True on a screen a guest owns, which draws its own page and never the desk's navigation. */
export function isGuestScreen(pathname: string): boolean {
  return GUEST_SCREENS.some((p) => pathname.startsWith(p))
}

/** True wherever nobody is expected to be signed in, so a 401 is normal rather than a lost session. */
export function isPublicScreen(pathname: string): boolean {
  return PUBLIC_SCREENS.some((p) => pathname.startsWith(p))
}
