/**
 * Browser smoke of the whole app against the seeded dev API: node e2e/web/run.mjs [screenshot dir].
 * Needs the API on :8080 (dev profile, PMS_ALLOWED_ORIGINS including the app origin) and `npm run web` on :8081.
 * Every step creates its own data, so it can run again on the same database. Exits non-zero on any failure.
 */
import { mkdirSync } from "node:fs"

import { addCharge, openStayBySearch, removeCharge, settleAndCheckOut, walkIn } from "./flows.mjs"
import { backToRoot, clickTop, open, signIn, signOut, topOf } from "./harness.mjs"

const out = process.argv[2] ?? "e2e/web/shots"
mkdirSync(out, { recursive: true })
const { browser, page, step, results, writes } = await open(out)
const text = (s) => page.getByText(s, { exact: true })
const tab = (s) => clickTop(text(s))
const stamp = Date.now().toString().slice(-5)
const owners = `Desk ${stamp}`
const staffs = `Staff ${stamp}`

// Owner: the whole life of a walk-in stay.
await step("owner signs in → Today", () => signIn(page, { email: "owner@pms.local" }))
await step("walk-in check-in", () => walkIn(page, owners, `98765${stamp}`))
await step("add a charge", () => addCharge(page, "Thali", 150))
await step("remove it: reason only, owner needs no PIN", async () => {
  if (!(await removeCharge(page, "Thali"))) throw new Error("charge still on the bill")
})
// Leaving on the day of arrival lowers the bill, so the server first asks for the overpayment back (409).
await step("take payment and check out", () => settleAndCheckOut(page), { expect: [409] })
await step("issue invoice → listed under Receipts", async () => {
  await clickTop(page.getByTestId("stay-menu"))
  await clickTop(page.getByRole("menuitem", { name: "Invoice", exact: true }))
  await text("Open").waitFor({ timeout: 10000 })
  await backToRoot(page, 1)
  await tab("Receipts")
  if ((await page.locator("body").innerText()).includes("No receipts yet"))
    throw new Error("no invoice")
})

// Owner: every tab and screen opens without an error.
await step("back to Today", async () => {
  await backToRoot(page)
  await page.getByTestId("today-checkin").first().waitFor({ timeout: 8000 })
})
for (const t of ["Bookings", "Rooms", "More"])
  await step(`tab ${t}`, async () => {
    await tab(t)
    await page.waitForTimeout(2000)
  })
// Guests and Reports are not on the bar: they are the first rows of More.
for (const s of ["Guests", "Reports"])
  await step(`more → ${s}`, async () => {
    await tab("More")
    await page.waitForTimeout(600)
    await clickTop(page.getByText(s, { exact: true }))
    await page.waitForTimeout(2000)
  })
const settingsScreens = [
  "Maintenance",
  "Lost and found",
  "Restaurant",
  "Inventory",
  "Expenses",
  "Audit log",
  "Property details",
  "Rooms and rates",
  "Tax",
  "Staff",
  "Channels",
]
for (const s of settingsScreens)
  await step(`settings → ${s}`, async () => {
    await tab("More")
    await page.waitForTimeout(600)
    await clickTop(page.getByText(new RegExp(`^${s}`)))
    await page.waitForTimeout(2000)
    await backToRoot(page, 1)
  })
await step("rooms: open a tile, mark it clean if it needs cleaning", async () => {
  await tab("Rooms")
  await page.waitForTimeout(1500)
  await clickTop(text("101"))
  await page.waitForTimeout(800)
  const clean = page.getByRole("button", { name: /^Mark clean|^Clean$/ })
  if (await clean.locator("visible=true").count()) await clickTop(clean)
  await clickTop(page.getByLabel("Close"), 3000).catch(() => {})
})
await step("reports: period report", async () => {
  await tab("Reports")
  await clickTop(page.getByRole("button", { name: "More" }))
  await clickTop(page.getByRole("menuitem", { name: /period/i }))
  await page.waitForTimeout(2500)
  await backToRoot(page, 1)
})
await step("new booking → reserved → cancelled with a reason", async () => {
  await tab("Bookings")
  await clickTop(text("New booking"))
  await (await topOf(page.getByTestId("guest-name"))).fill(`Advance ${stamp}`)
  await (await topOf(page.getByTestId("guest-phone"))).fill(`98111${stamp}`)
  await clickTop(text("AC Room · ₹1,500"))
  const consent = text("I have told the guest why their details are being recorded.")
  if (await consent.locator("visible=true").count()) await clickTop(consent)
  await clickTop(page.getByTestId("booking-submit"))
  await text("Reserved").locator("visible=true").first().waitFor({ timeout: 15000 })
  await clickTop(page.getByTestId("stay-menu"))
  await clickTop(page.getByRole("menuitem", { name: /Cancel/ }))
  await (await topOf(page.getByTestId("cancel-reason"))).fill("Guest changed plans")
  await clickTop(page.getByTestId("cancel-submit"))
  await text("Cancelled").locator("visible=true").first().waitFor({ timeout: 15000 })
  await backToRoot(page)
})
await step("notifications", async () => {
  await tab("Today")
  await clickTop(page.getByRole("button", { name: "Notifications" }))
  await text("Notifications").locator("visible=true").first().waitFor({ timeout: 8000 })
  await backToRoot(page, 1)
})
await step("owner signs out", () => signOut(page))

// Staff: the same removal needs a manager's PIN.
await step("staff signs in; no Reports row on More", async () => {
  await signIn(page, { email: "staff@pms.local" })
  await tab("More")
  await page.waitForTimeout(600)
  if (await text("Reports").locator("visible=true").count()) throw new Error("staff sees Reports")
  await tab("Today")
})
await step("staff: walk-in check-in", () => walkIn(page, staffs, `98700${stamp}`))
await step("staff: add a charge", () => addCharge(page, "Tea", 40))
await step(
  "staff: wrong PIN is refused",
  async () => {
    if (await removeCharge(page, "Tea", { pin: "0000" }))
      throw new Error("removed with a wrong PIN")
    await text("Wrong approval PIN").locator("visible=true").first().waitFor({ timeout: 5000 })
  },
  { expect: [403] },
)
await step("staff: manager PIN removes it", async () => {
  await (await topOf(page.locator('input[type="password"]'))).fill("1234")
  await clickTop(page.getByTestId("remove-line-submit"))
  await text("Tea")
    .locator("visible=true")
    .first()
    .waitFor({ state: "detached", timeout: 10000 })
    .catch(() => {})
  if (await text("Tea").locator("visible=true").count()) throw new Error("charge still on the bill")
})
await step("staff signs out", () => signOut(page))

// Owner settles the staff's stay so the room is free for the next run.
await step(
  "owner settles the staff's stay",
  async () => {
    await signIn(page, { email: "owner@pms.local" })
    await openStayBySearch(page, staffs)
    await settleAndCheckOut(page)
    await signOut(page)
  },
  { expect: [409] },
)

// Platform admin: the property photo, compressed on the device, then removed.
await step("platform admin signs in (no property code)", () =>
  signIn(page, { email: "admin@pms.local", code: "", landing: null }),
)
await step("platform: upload the property photo, then remove it", async () => {
  await clickTop(page.getByText("Shri Ram Dharamshala"))
  await text("Property photo").locator("visible=true").first().waitFor({ timeout: 10000 })
  const chooser = page.waitForEvent("filechooser", { timeout: 15000 })
  await clickTop(text("Gallery"))
  await (
    await chooser
  ).setFiles(new URL("../../assets/images/app-icon-all.png", import.meta.url).pathname)
  await text("Remove photo").locator("visible=true").first().waitFor({ timeout: 20000 })
  await clickTop(text("Remove photo"))
  await page.waitForTimeout(2000)
  if (await text("Remove photo").locator("visible=true").count())
    throw new Error("photo not removed")
})

console.log(
  `\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} steps passed`,
)
console.log(`writes:\n  ${writes.join("\n  ")}`)
await browser.close()
process.exit(results.every((r) => r.startsWith("PASS")) ? 0 : 1)
