/*
 * Service worker: keeps the app usable when the network is not.
 *
 * The shell is cached so the app opens instantly and works with no signal. A short list of reads the desk
 * needs offline (who is signed in, the rooms, the rates, the settings, the bookings on the calendar) is tried
 * on the network first and falls back to the last good copy. Everything else about a guest, a report or a
 * file is never written to the cache, and what is cached is thrown away when someone signs out or changes
 * property (see session.tsx). Writes are never cached here; they go through the IndexedDB queue in the app.
 */
const VERSION = "v2" // bumping it discards every cache of the previous version on activation
const SHELL = `pms-shell-${VERSION}`
const DATA = `pms-data-${VERSION}`
const SHELL_URLS = ["/", "/check-in", "/rooms", "/bookings", "/manifest.webmanifest"]
/** API reads worth having offline. Anything not listed is fetched live or not at all. */
const OFFLINE_READS = ["/api/auth/me", "/api/rooms", "/api/room-types", "/api/settings", "/api/property", "/api/dashboard", "/api/bookings"]
/** Pages strangers open: they are not the desk's shell and must never be cached on a guest's phone. */
const PUBLIC_PAGES = ["/g/", "/book/", "/login"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const cacheable = (url, response) => {
  if (PUBLIC_PAGES.some((p) => url.pathname.startsWith(p))) return null
  if ((response.headers.get("Cache-Control") || "").includes("no-store")) return null
  if (url.pathname.startsWith("/api/")) return OFFLINE_READS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/") || url.pathname.startsWith(p + "?")) ? DATA : null
  return SHELL
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return // writes belong to the app's queue, not to the cache
  const url = new URL(request.url)
  if (PUBLIC_PAGES.some((p) => url.pathname.startsWith(p)) || url.pathname.startsWith("/api/public/")) return // straight to the network

  event.respondWith(
    fetch(request)
      .then((response) => {
        const store = response.ok ? cacheable(url, response) : null
        if (store) {
          const copy = response.clone()
          caches.open(store).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === "navigate") return caches.match("/")
        return new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } })
      }),
  )
})
