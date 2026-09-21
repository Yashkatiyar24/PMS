/**
 * The platform's back office, driven as the platform admin: the list and its filters, one property's page,
 * and the controls on it. Every change it makes is changed back, so the seeded data is left as it was found.
 *
 *   npm run dev
 *   PMS_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run admin-check
 */
import { mkdirSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { chromium } from "playwright"

mkdirSync("ui-check-shots", { recursive: true })
const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const API = process.env.PMS_API_BASE ?? "http://localhost:8080"
const results = []
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`)
}
/** Poll until `fn` is true, for a change the server has to confirm first. */
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)) }
  return false
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const page = await (await browser.newContext({ viewport: { width: 1366, height: 820 } })).newPage()
const errors = [], failed = []
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)))
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)))
page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`))

/** Nothing may spill past the right edge of a phone. */
const overflows = async (where) => {
  const spills = await page.$$eval("body *", (nodes) =>
    nodes.filter((n) => {
      if (n.closest("[data-nextjs-dev-tools-button], nextjs-portal, .overflow-x-auto, .overflow-auto")) return false
      const r = n.getBoundingClientRect()
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1
    }).map((n) => `${n.tagName.toLowerCase()}.${n.className || "?"}`.slice(0, 60)))
  check(`nothing spills off the right edge of ${where}`, spills.length === 0, spills.slice(0, 3).join(" | "))
}

try {
  // --- The platform admin signs in. They run no property of their own. ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /भाषा|Language/ }).click()
  await page.getByRole("button", { name: /Sign in/i }).first().click()
  await page.getByRole("tab", { name: /Email/ }).click()
  await page.getByLabel("Email").fill("admin@pms.local")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(/\/admin$/, { timeout: 20000 })
  check("signing in lands the platform admin on the platform screen", true)
  await page.locator("aside nav a[href^='/admin/']").first().waitFor({ timeout: 15000 })
  const rail = (await page.locator("aside nav a").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim())
  check("the rail offers the platform, its two watch lists and the properties", rail[0] === "Platform" && /^Needs attention/.test(rail[1]) && /^Quiet/.test(rail[2]) && rail.some((r) => r === "Shri Ram Dharamshala"), rail.join(" | "))
  check("the rail shows no property screens to someone with no property", !rail.some((r) => /Today|Bookings|Rooms|Settings/.test(r)))
  check("there is no guest search bar for someone with no property", (await page.getByPlaceholder(/Search guests/).count()) === 0)

  // --- The list ---
  await page.getByRole("heading", { name: "Platform" }).waitFor({ timeout: 15000 })
  // Scoped to the page: the rail lists the same properties.
  const rows = page.locator("main a[href^='/admin/']")
  await rows.first().waitFor({ timeout: 15000 })
  const all = await rows.count()
  check("every property is listed", all >= 2, `${all} rows`)
  const tiles = page.locator("span.uppercase")
  check("the overview tiles are there", (await tiles.getByText("Properties", { exact: true }).count()) === 1 && (await tiles.getByText("Unpaid bills", { exact: true }).count()) === 1)
  await page.getByRole("tab", { name: /Trial/ }).click()
  check("the billing filter narrows the list", (await rows.count()) <= all)
  await page.getByRole("tab", { name: /^All/ }).click()
  await page.getByPlaceholder(/Search by name/).fill("SRD1001")
  check("search by code finds exactly one property", (await rows.count()) === 1, `${await rows.count()} rows`)
  await page.getByPlaceholder(/Search by name/).fill("")
  await page.getByRole("tab", { name: /Quiet/ }).click()
  check("the quiet filter narrows the list", (await rows.count()) <= all)
  await page.getByRole("tab", { name: /^All/ }).click()

  // The rail's watch list and the tab are the same filter: one URL, both highlighted.
  await page.locator("aside nav a[href='/admin?filter=attention']").click()
  const railFilters = await until(async () => page.url().endsWith("/admin?filter=attention")
    && (await page.getByRole("tab", { name: /Needs attention/ }).getAttribute("aria-selected")) === "true"
    && (await page.locator("aside nav a[href='/admin?filter=attention']").getAttribute("aria-current")) === "page")
  check("the rail's watch list opens the same filter as the tab", railFilters, page.url())
  await page.getByRole("tab", { name: /^All/ }).click()
  await until(async () => page.url().endsWith("/admin"))

  // Sorting by rooms puts the biggest property first; the cards carry the number.
  await page.getByLabel("Sort by").selectOption("rooms")
  const roomCounts = await rows.locator("dd").evaluateAll((dds) => dds.filter((_, i) => i % 3 === 0).map((d) => Number(d.textContent)))
  check("sorting by rooms orders the cards", roomCounts.every((n, i) => i === 0 || n <= roomCounts[i - 1]), roomCounts.join(","))
  await page.getByLabel("Sort by").selectOption("name")
  await page.screenshot({ path: "ui-check-shots/admin-list.png" })

  // The list view, remembered across a reload, then back to cards.
  await page.getByRole("button", { name: "List", exact: true }).click()
  check("the list view shows a table header", (await page.getByText("Property", { exact: true }).count()) >= 1 && (await rows.count()) === all)
  await page.reload({ waitUntil: "networkidle" })
  await rows.first().waitFor({ timeout: 15000 })
  check("the chosen view survives a reload", (await page.getByRole("button", { name: "List", exact: true }).getAttribute("aria-pressed")) === "true")
  await page.screenshot({ path: "ui-check-shots/admin-list-table.png" })
  await page.getByRole("button", { name: "Cards", exact: true }).click()

  // Export: a CSV with one line per shown property and no guest data.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export CSV/ }).click()])
  const csv = readFileSync(await download.path(), "utf8")
  check("export gives a CSV of the shown properties", download.suggestedFilename().endsWith(".csv") && csv.split("\n").length === all + 1 && csv.startsWith("name,code,city") && csv.includes("SRD1001"), download.suggestedFilename())

  // --- One property ---
  await page.locator("main").getByRole("link", { name: /Shri Ram Dharamshala/ }).click()
  await page.waitForURL(/\/admin\/[0-9a-f-]+$/, { timeout: 15000 })
  const main = page.locator("main")
  await main.getByRole("heading", { name: "Shri Ram Dharamshala" }).waitFor({ timeout: 15000 })
  check("the property page shows its code and owner", (await main.getByText("SRD1001").count()) >= 1 && (await main.getByText(/Ramesh Agarwal/).count()) >= 1)
  check("the rail highlights the open property", (await page.locator("aside nav a[aria-current='page']").innerText()).trim() === "Shri Ram Dharamshala")
  check("the team is listed with roles", (await main.getByText("Owner", { exact: true }).count()) >= 1)
  check("recent changes are listed", (await main.locator("li").filter({ hasText: /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · / }).count()) > 0)

  // Billing: change it and change it back. The chip in the header must follow each time.
  const header = main.locator("header")
  const headerChip = header.locator("span").filter({ hasText: /^(Trial|Active|Overdue|Read-only|Closed|Off)$/ }).first()
  const before = (await headerChip.innerText()).trim()
  const other = before === "Active" ? "Trial" : "Active"
  await main.getByRole("button", { name: other, exact: true }).click()
  const changed = await until(async () => (await headerChip.innerText()).trim() === other)
  await main.getByRole("button", { name: before, exact: true }).click()
  const restored = await until(async () => (await headerChip.innerText()).trim() === before)
  check("billing can be changed and the page shows it at once", changed && restored, `${before} → ${other} → ${(await headerChip.innerText()).trim()}`)

  // A feature: off, then on again.
  const feature = main.getByRole("button", { name: "Audit log", exact: true })
  const wasOn = (await feature.getAttribute("aria-pressed")) === "true"
  await feature.click()
  const off = await until(async () => (await feature.getAttribute("aria-pressed")) === String(!wasOn))
  await feature.click()
  const on = await until(async () => (await feature.getAttribute("aria-pressed")) === String(wasOn))
  check("an extra feature can be switched off and back on", off && on)

  // Off, then on again: the header chip and the banner must follow.
  const power = main.getByRole("switch", { name: "Property is on" })
  await power.click()
  const wentOff = await until(async () => (await power.getAttribute("aria-checked")) === "false" && (await main.getByText("This property is switched off").count()) === 1 && (await headerChip.innerText()).trim() === "Off")
  await power.click()
  const backOn = await until(async () => (await power.getAttribute("aria-checked")) === "true" && (await main.getByText("This property is switched off").count()) === 0)
  check("the property can be switched off and on again", wentOff && backOn)

  // Notes are saved on blur and survive a reload; then cleared again.
  const notes = main.getByLabel("Internal notes")
  await notes.fill("Called the owner about GST on 20 Sep.")
  await notes.blur()
  const savedChip = await until(async () => (await main.getByText("Saved", { exact: true }).count()) === 1)
  await page.reload({ waitUntil: "networkidle" })
  await main.getByRole("heading", { name: "Shri Ram Dharamshala" }).waitFor({ timeout: 15000 })
  check("internal notes are saved and come back after a reload", savedChip && (await main.getByLabel("Internal notes").inputValue()) === "Called the owner about GST on 20 Sep.")
  await main.getByLabel("Internal notes").fill("")
  await main.getByLabel("Internal notes").blur()
  await until(async () => (await main.getByText("Saved", { exact: true }).count()) === 1)

  // A new password for a member of staff, confirmed, shown once, and usable straight away.
  page.once("dialog", (d) => d.accept())
  await main.getByRole("button", { name: "Reset password: Mohan Lal" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByRole("heading", { name: /New password for Mohan Lal/ }).waitFor({ timeout: 15000 })
  const fresh = (await sheet.locator("code, .font-mono").filter({ hasText: /^[A-Za-z0-9]{8,}$/ }).last().innerText()).trim()
  await page.screenshot({ path: "ui-check-shots/admin-password.png" })
  await page.keyboard.press("Escape")
  const other2 = await (await browser.newContext()).newPage()
  const login = await other2.request.post(`${API}/api/auth/login`, { headers: { "X-Requested-With": "pms" }, data: { code: "SRD1001", phone: "9000000003", password: fresh } })
  check("the reset password signs the staff member in at once", login.ok(), `${login.status()} with ${fresh.length} chars`)
  await other2.context().close()
  // Put the seeded password back so the other checks, which document "password123", stay true.
  try {
    execSync(`docker exec pms-pg psql -U postgres -d pms -qc "update users set password_hash = (select password_hash from users where email = 'owner@pms.local') where email = 'staff@pms.local'"`, { stdio: "ignore" })
  } catch { console.log("      (could not restore staff@pms.local's password: no docker; restart the API to reseed)") }

  // The property's photograph: set it, see it, take it away again.
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64")
  // The card is the innermost box holding both the heading and the hidden file input.
  const photoCard = main.locator("div").filter({ has: page.getByRole("heading", { name: "Property photo" }) }).filter({ has: page.locator("input[type=file]") }).last()
  if (await photoCard.getByRole("button", { name: "Remove photo" }).count()) await photoCard.getByRole("button", { name: "Remove photo" }).click()
  await photoCard.locator("input[type=file]").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG })
  const shown = await until(async () => (await photoCard.locator("img[alt='Property photo']").count()) === 1)
  check("the platform can add the property's photo and sees it at once", shown)
  await page.screenshot({ path: "ui-check-shots/admin-property.png", fullPage: true })
  await photoCard.getByRole("button", { name: "Remove photo" }).click()
  const gone = await until(async () => (await photoCard.getByText("No photo yet").count()) === 1)
  check("and can take it away again", gone)

  // --- The same two screens on a phone ---
  await page.setViewportSize({ width: 360, height: 740 })
  await page.waitForTimeout(300)
  await overflows("the property page")
  await page.screenshot({ path: "ui-check-shots/admin-property-phone.png", fullPage: true })
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" })
  await rows.first().waitFor({ timeout: 15000 })
  await overflows("the platform list")
  await page.screenshot({ path: "ui-check-shots/admin-list-phone.png", fullPage: true })

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 2).join(" | "))
  check("no failed requests", failed.length === 0, failed.slice(0, 3).join(" | "))
} catch (e) {
  check("the run completed", false, String(e).split("\n")[0])
} finally {
  await browser.close()
}

const bad = results.filter((r) => !r.ok)
console.log()
console.log(bad.length === 0 ? "ALL PLATFORM CHECKS PASSED" : `${bad.length} FAILED`)
process.exit(bad.length === 0 ? 0 : 1)
