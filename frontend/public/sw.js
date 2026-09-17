/*
 * Service worker: keeps the app usable when the network is not.
 *
 * The shell is cached so the app opens instantly and works with no signal. Read requests are tried on the
 * network first and fall back to the last good copy, so the desk sees slightly stale data rather than an
 * error page. Writes are never cached here; they go through the IndexedDB queue in the app, which can
 * replay them in order with their idempotency keys.
 */
const VERSION = "v1"
const SHELL = `pms-shell-${VERSION}`
const DATA = `pms-data-${VERSION}`
const SHELL_URLS = ["/", "/check-in", "/rooms", "/bookings", "/manifest.webmanifest"]

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

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return // writes belong to the app's queue, not to the cache

  const url = new URL(request.url)
  const isApiRead = url.pathname.startsWith("/api/")

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(isApiRead ? DATA : SHELL).then((cache) => cache.put(request, copy))
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
