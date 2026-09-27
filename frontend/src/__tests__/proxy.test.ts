/**
 * Which hostname may see what.
 *
 * The API is what actually guards the back office — it checks SUPER_ADMIN on every /api/admin request
 * whatever hostname asked — so nothing here is the security boundary. These tests pin the behaviour that is
 * easy to break by accident: that a deployment without the domain keeps working exactly as before, and that
 * once the domain is set the two hostnames stop showing each other's screens.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const ADMIN_HOST = "admin.padav.in"
const APP_HOST = "app.padav.in"

/** The proxy reads its hostname once, when the module loads, so each case gets a fresh import. */
async function proxyWith(adminHost?: string) {
  vi.resetModules()
  if (adminHost) process.env.PMS_ADMIN_HOST = adminHost
  else delete process.env.PMS_ADMIN_HOST
  return (await import("../proxy")).proxy
}

/** A request as the browser sends it: a host header, and the session cookie only when signed in. */
function request(host: string, path: string, { signedIn = true } = {}) {
  const headers = new Headers({ host })
  if (signedIn) headers.set("cookie", "pms_session=whatever")
  // The hostname in the URL is the one without a port, so a ":443" host header is still exercised above.
  return new NextRequest(`https://${host.split(":")[0]}${path}`, { headers })
}

const location = (res: Response) => new URL(res.headers.get("location") ?? "https://x/", "https://x").pathname

afterEach(() => {
  delete process.env.PMS_ADMIN_HOST
})

describe("without the admin domain", () => {
  it("leaves the back office where it has always been", async () => {
    const proxy = await proxyWith()
    expect(location(proxy(request(APP_HOST, "/admin")))).toBe("/")
    expect(proxy(request(APP_HOST, "/admin")).headers.get("location")).toBeNull()
  })

  it("still sends a signed-out person to the login form", async () => {
    const proxy = await proxyWith()
    expect(location(proxy(request(APP_HOST, "/bookings", { signedIn: false })))).toBe("/login")
  })

  it("still lets a guest through with no session", async () => {
    const proxy = await proxyWith()
    expect(proxy(request(APP_HOST, "/s/token", { signedIn: false })).headers.get("location")).toBeNull()
  })
})

describe("with the admin domain set", () => {
  it("serves the back office on its own hostname", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(proxy(request(ADMIN_HOST, "/admin")).headers.get("location")).toBeNull()
    expect(proxy(request(ADMIN_HOST, "/admin/some-property")).headers.get("location")).toBeNull()
  })

  it("lets the platform admin sign in there", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(proxy(request(ADMIN_HOST, "/login", { signedIn: false })).headers.get("location")).toBeNull()
  })

  it("does not serve the desk app on the back office hostname", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(location(proxy(request(ADMIN_HOST, "/bookings")))).toBe("/admin")
    expect(location(proxy(request(ADMIN_HOST, "/")))).toBe("/admin")
  })

  it("hides the back office from every other hostname", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(location(proxy(request(APP_HOST, "/admin")))).toBe("/")
    expect(location(proxy(request(APP_HOST, "/admin/some-property")))).toBe("/")
  })

  /** A proxy in front may append the port; the hostname is what decides. */
  it("ignores a port on the host header", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(proxy(request(`${ADMIN_HOST}:443`, "/admin")).headers.get("location")).toBeNull()
  })

  /** "/administration" is not the back office, and must not be swallowed by a prefix match. */
  it("matches the back office path exactly", async () => {
    const proxy = await proxyWith(ADMIN_HOST)
    expect(location(proxy(request(ADMIN_HOST, "/administration")))).toBe("/admin")
  })
})
