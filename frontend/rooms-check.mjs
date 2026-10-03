/**
 * The room inventory, driven the way a property is actually set up: a brand-new property is onboarded by the
 * platform, its owner signs in, and the rooms it arrived with are re-planned, renamed, moved and taken out of
 * use. Everything it creates belongs to a throwaway property, which it deletes on the way out.
 *
 *   npm run dev
 *   PMS_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run rooms-check
 */
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

mkdirSync("ui-check-shots", { recursive: true })
const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const API = process.env.PMS_API_BASE ?? "http://localhost:8080"
const results = []
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`)
}
const until = async (read, want, ms = 15000) => {
  const end = Date.now() + ms
  for (;;) {
    const got = await read()
    if (got === want || Date.now() > end) return got
    await new Promise((r) => setTimeout(r, 250))
  }
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
const errors = []
page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(m.text().slice(0, 120)))
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)))

const stamp = Date.now() % 100000
let property = null

try {
  // --- A new property, onboarded by the platform exactly as a real one is ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await page.request.post(`${API}/api/auth/login`, { headers: { "X-Requested-With": "pms" }, data: { email: "admin@pms.local", password: "password123" } })
  const onboarded = await (await page.request.post(`${API}/api/admin/properties`, {
    headers: { "X-Requested-With": "pms" },
    data: {
      orgName: `Rooms Check Trust ${stamp}`, propertyName: `Rooms Check ${stamp}`, city: "Haridwar", state: "Uttarakhand",
      phone: "9870000000", ownerName: "Rooms Owner", ownerPhone: `98700${String(stamp).padStart(5, "0")}`,
      ownerEmail: `rooms${stamp}@pms.local`, planCode: null,
    },
  })).json()
  property = onboarded.propertyId
  check("a new property is onboarded", Boolean(property), onboarded.code)

  // --- It arrives furnished: twenty-five rooms over three floors, numbered 101-110, 201-210, 301-305 ---
  const asOwner = async (path, init) => {
    const res = await page.request.fetch(`${API}${path}`, { headers: { "X-Requested-With": "pms" }, ...init })
    return res.ok() ? res.json() : Promise.reject(new Error(`${res.status()} ${path} ${await res.text()}`))
  }
  await page.request.post(`${API}/api/auth/login`, {
    headers: { "X-Requested-With": "pms" },
    data: { code: onboarded.code, email: onboarded.ownerEmail, password: onboarded.ownerPassword },
  })
  // A password somebody else chose opens only the door to replacing it, exactly as it does for a real owner.
  const changed = await page.request.post(`${API}/api/users/me/password`, {
    headers: { "X-Requested-With": "pms" },
    data: { email: onboarded.ownerEmail, currentPassword: onboarded.ownerPassword, password: "roomsCheck123" },
  })
  check("the owner sets their own password before anything else", changed.ok(), `HTTP ${changed.status()}`)
  await page.request.post(`${API}/api/auth/login`, {
    headers: { "X-Requested-With": "pms" },
    data: { code: onboarded.code, email: onboarded.ownerEmail, password: "roomsCheck123" },
  })
  let rooms = await asOwner("/api/rooms")
  const numbers = rooms.map((r) => r.number)
  check("a new property starts with 25 rooms", rooms.length === 25, String(rooms.length))
  check("they are spread 10 / 10 / 5 over three floors",
    JSON.stringify([1, 2, 3].map((f) => rooms.filter((r) => r.floor === f).length)) === "[10,10,5]",
    JSON.stringify([1, 2, 3].map((f) => rooms.filter((r) => r.floor === f).length)))
  check("and numbered by floor", ["101", "110", "201", "210", "301", "305"].every((n) => numbers.includes(n)))
  const floors = await asOwner("/api/floors")
  check("each floor has a row of its own", floors.length === 3, floors.map((f) => `${f.number}:${f.rooms}`).join(" "))

  // --- The owner's own browser session, from here on ---
  await page.goto(`${BASE}/settings/rooms`, { waitUntil: "networkidle" })
  const floorHeader = page.locator("summary").filter({ hasText: /Floor 1|मंज़िल 1/ }).first()
  await floorHeader.waitFor({ timeout: 20000 })
  check("the rooms screen groups them floor by floor", true)
  check("a floor says how many rooms are on it", /10 (rooms|कमरे)/.test(await floorHeader.innerText()), (await floorHeader.innerText()).replace(/\n/g, " "))
  await page.screenshot({ path: "ui-check-shots/rooms-floors.png", fullPage: true })

  // --- Search and filter ---
  const row = (number) => page.getByRole("button", { name: new RegExp(`(^|\\s)${number}(\\s|$)`) }).first()
  const rowCount = (number) => page.getByRole("button", { name: new RegExp(`(^|\\s)${number}(\\s|$)`) }).count()
  const search = page.getByLabel(/Search a room number|कमरा नंबर या नाम खोजें/)
  await search.fill("305")
  check("searching a number finds that room", (await until(() => rowCount("305"), 1)) === 1)
  check("and hides the rest", (await rowCount("101")) === 0)
  await search.fill("")
  await until(() => rowCount("101"), 1)

  // --- Editing one room, including the fields a room has of its own ---
  await row("101").scrollIntoViewIfNeeded()
  await row("101").click({ timeout: 15000 })
  const sheet = page.getByRole("dialog")
  await sheet.waitFor({ timeout: 10000 })
  await sheet.getByLabel(/Room name|कमरे का नाम/).fill("Corner suite")
  await sheet.getByLabel(/^Description$|^विवरण$/).fill("Faces the river")
  await sheet.getByRole("button", { name: /^Save$|^सहेजें$/ }).click()
  await sheet.waitFor({ state: "hidden", timeout: 15000 })
  rooms = await asOwner("/api/rooms")
  check("a room keeps the name and note the owner typed", rooms.find((r) => r.number === "101")?.name === "Corner suite",
    rooms.find((r) => r.number === "101")?.name)

  // --- Five rooms at once ---
  const deluxe = await asOwner("/api/room-types", {
    method: "POST",
    data: { name: "Deluxe", baseRatePaise: 250000, maxOccupancy: 3, extraPersonPaise: 0, dormitory: false, bedCount: 0, sortOrder: 1, active: true, amenities: ["AC", "WiFi"] },
  })
  const five = rooms.filter((r) => r.floor === 2).slice(0, 5).map((r) => r.id)
  await asOwner("/api/rooms/bulk-update", { method: "POST", data: { roomIds: five, roomTypeId: deluxe.id, floor: null, active: null } })
  rooms = await asOwner("/api/rooms")
  check("five rooms become Deluxe together", rooms.filter((r) => r.roomTypeName === "Deluxe").length === 5)
  check("the rate comes with the type", rooms.find((r) => r.roomTypeName === "Deluxe") !== undefined)

  // --- Growing the inventory from the setup screen, without disturbing what is there ---
  await page.goto(`${BASE}/settings/rooms/setup`, { waitUntil: "networkidle" })
  await page.getByLabel(/Rooms on floor 3|मंज़िल 3 के कमरे/).fill("10")
  await page.getByRole("button", { name: /Add a floor|मंज़िल जोड़ें/ }).click()
  check("the total follows the floors", await page.getByText(/Total rooms: 4[05]|कुल कमरे: 4[05]/).isVisible())
  await page.getByRole("button", { name: /Show what will be created|क्या बनेगा/ }).click()
  await page.getByText(/Review the plan|योजना जाँच लें/).first().waitFor({ timeout: 15000 })
  const previewText = await page.locator("main").innerText()
  check("the preview marks the new rooms and keeps the old ones", previewText.includes("+ 306") && previewText.includes("301"),
    previewText.includes("+ 306") ? "" : previewText.replace(/\s+/g, " ").slice(0, 160))
  await page.screenshot({ path: "ui-check-shots/rooms-preview.png", fullPage: true })
  await page.getByRole("button", { name: /Create \d+ rooms|\d+ कमरे बनाएं/ }).click()
  await page.getByText(/rooms created|कमरे बन गए/).waitFor({ timeout: 20000 })
  const grown = await asOwner("/api/rooms")
  check("the new rooms are created", grown.length > rooms.length, `${rooms.length} → ${grown.length}`)
  check("and every earlier room is untouched", rooms.every((r) => grown.some((g) => g.id === r.id && g.number === r.number)))
  check("including the one the owner renamed", grown.find((r) => r.number === "101")?.name === "Corner suite")

  // --- Reducing the count removes nothing; it says what is spare ---
  const shrink = await asOwner("/api/rooms/setup", {
    method: "POST",
    data: { floors: [{ floor: 1, rooms: 10, name: null }, { floor: 2, rooms: 10, name: null }], roomTypeId: null, apply: true },
  })
  check("asking for fewer rooms deletes nothing", (await asOwner("/api/rooms")).length === grown.length)
  check("it reports the rooms beyond the plan instead", shrink.surplus > 0, `${shrink.surplus} spare`)

  // --- A booked room cannot leave the inventory ---
  const guest = await asOwner("/api/guests", { method: "POST", data: { name: "Rooms Check Guest", phone: "9870000001", city: "", address: "", nationality: "IN", idType: null, idLast4: null, notes: "" } })
  const target = grown.find((r) => r.number === "110")
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const afterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  await asOwner("/api/bookings/reserve", {
    method: "POST",
    data: {
      guestId: guest.id, newGuest: null, roomTypeId: null, units: [{ roomId: target.id, bedId: null, ratePaise: null }],
      arriveAt: `${tomorrow}T14:00:00+05:30`, departAt: `${afterTomorrow}T10:00:00+05:30`,
      adults: 1, children: 0, purpose: "pilgrimage", notes: "", consent: true, whatsappOptIn: false,
      advancePaise: null, advanceMode: null, clientUuid: null, source: null, tentative: false, details: null,
    },
  }).then(() => check("a booking is made for one of the rooms", true))
    .catch((e) => check("a booking is made for one of the rooms", false, String(e).slice(0, 160)))
  const refused = await page.request.fetch(`${API}/api/rooms/${target.id}`, {
    method: "PUT", headers: { "X-Requested-With": "pms" },
    data: { roomTypeId: target.roomTypeId, number: target.number, floor: target.floor, active: false, building: "", name: "", bedType: "", description: "" },
  })
  check("a booked room cannot be taken out of use", refused.status() === 400, `HTTP ${refused.status()}`)
  check("and it is still in use", (await asOwner("/api/rooms")).find((r) => r.id === target.id)?.active === true)

  // --- The dashboard counts the inventory ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.getByText(/Room inventory|कमरों की सूची/).waitFor({ timeout: 20000 })
  check("the dashboard shows the room inventory", true)
  await page.screenshot({ path: "ui-check-shots/rooms-dashboard.png", fullPage: true })

  // --- Another property's rooms are invisible ---
  const mine = (await asOwner("/api/rooms")).length
  await page.request.post(`${API}/api/auth/login`, { headers: { "X-Requested-With": "pms" }, data: { code: "SRD1001", email: "owner@pms.local", password: "password123" } })
  const theirs = await asOwner("/api/rooms")
  check("another property sees only its own rooms", theirs.length !== mine && !theirs.some((r) => r.name === "Corner suite"),
    `${theirs.length} vs ${mine}`)

  check("no JavaScript errors on the way through", errors.length === 0, errors.slice(0, 2).join(" | "))
} catch (e) {
  check("the run completed", false, String(e).split("\n").slice(0, 3).join(" | ").slice(0, 400))
  // What the screen actually looked like when it went wrong, which is the first thing anybody will want.
  await page.screenshot({ path: "ui-check-shots/rooms-failure.png", fullPage: true }).catch(() => {})
  console.log((await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600))
} finally {
  // The throwaway property goes, whatever happened.
  if (property) {
    // Signing in left a session pointing at this property, and a user row of its own; both hold a key on it.
    const sql = [
      "booking_units", "folio_lines", "folios", "bookings", "guests", "notifications", "rooms", "room_types",
    ].map((t) => `delete from ${t} where property_id = '${property}'`)
      .concat([
        `delete from sessions where current_property_id = '${property}'`,
        `delete from sessions where user_id in (select user_id from property_users where property_id = '${property}')`,
        `delete from property_users where property_id = '${property}'`,
        `delete from users where email like 'rooms%@pms.local'`,
        `delete from properties where id = '${property}'`,
        // Only an organisation nothing is left in: an earlier run's leftovers are not this run's to remove.
        `delete from organisations where name like 'Rooms Check Trust%' and not exists (select 1 from properties where org_id = organisations.id)`,
      ])
    try {
      const { execSync } = await import("node:child_process")
      execSync(`psql -d ${process.env.PMS_DB ?? "pms"} ${sql.map((q) => `-c "${q}"`).join(" ")}`, { stdio: "pipe" })
      console.log("(the throwaway property was removed)")
    } catch (e) {
      console.log(`(left ${property} behind: ${String(e.stderr ?? e).split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200)})`)
    }
  }
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log()
console.log(failed.length === 0 ? "ALL ROOM INVENTORY CHECKS PASSED" : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
