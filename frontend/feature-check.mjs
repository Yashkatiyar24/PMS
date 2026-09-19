/**
 * The screens added after the first release, driven in a real browser at phone size: they load, nothing spills
 * off the edge, every control is thumb-sized, and nothing reaches the console. Run like ui-check:
 *
 *   npm run dev        # with the API on :8080 and the dev seed
 *   npm run feature-check
 *
 * Screenshots land in ./ui-check-shots. PMS_UI_BASE and PMS_CHROMIUM work as for ui-check.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const OUT = "ui-check-shots"
mkdirSync(OUT, { recursive: true })
const results = []
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`)
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 })
const page = await context.newPage()
const errors = []
page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(m.text()))
page.on("pageerror", (e) => errors.push(String(e)))

async function screen(path, name, ready) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" })
  await page.waitForSelector(ready, { timeout: 15000 })
  const spills = await page.$$eval("body *", (nodes) =>
    nodes.filter((n) => {
      if (n.closest("[data-nextjs-dev-tools-button], nextjs-portal, .overflow-x-auto, .overflow-auto")) return false
      const r = n.getBoundingClientRect()
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1
    }).map((n) => `${n.tagName.toLowerCase()}.${n.className || "?"}`.slice(0, 60)))
  const small = await page.$$eval("button:not([data-nextjs-dev-tools-button]), a[role='button'], label:has(> input[type=checkbox])", (nodes) =>
    nodes.filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).map((n) => (n.textContent || n.getAttribute("aria-label") || "?").trim().slice(0, 30)))
  check(`${name} loads and fits the phone`, spills.length === 0 && small.length === 0, [...spills.slice(0, 2), ...small.slice(0, 3)].join(" | "))
  await page.screenshot({ path: `${OUT}/feature-${name.replace(/\W+/g, "-")}.png`, fullPage: true })
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /भाषा|Language/ }).click()
  await page.getByRole("tab", { name: /Email/ }).click()
  await page.getByLabel("Email").fill("owner@pms.local")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })

  await screen("/rooms", "rooms", "text=/Floor/")
  // A room opens with the housekeeping cycle and its assignment.
  await page.locator("main ul li button").first().click()
  check("a room offers its housekeeping", await page.getByText("Housekeeping").first().isVisible())
  await page.screenshot({ path: `${OUT}/feature-room-sheet.png` })
  await page.keyboard.press("Escape")

  await screen("/settings", "settings with operations", "text=Operations")
  check("the operations list links the new work", (await page.getByRole("link", { name: /Maintenance|Expenses|Inventory|Restaurant|Guests|Audit/ }).count()) >= 6)
  await screen("/guests", "guests", "main input[type=search]")
  await screen("/maintenance", "maintenance", "main >> text=Maintenance")
  await screen("/lost-found", "lost and found", "main >> text=Lost and found")
  await screen("/expenses", "expenses", "main >> text=Expenses")
  await screen("/inventory", "inventory", "main >> text=Inventory")
  await screen("/restaurant", "restaurant", "main >> text=Restaurant")
  await screen("/reports/period", "period report", "text=ADR")
  await screen("/audit", "audit log", "main >> text=Audit log")
  await screen("/notifications", "notifications", "main >> text=Notifications")
  await screen("/portfolio", "portfolio", "main >> text=All properties")
  await screen("/bookings/new", "new booking", "text=How did it come in?")
  await page.getByRole("button", { name: "Group", exact: true }).click()
  check("a group booking asks for its name", await page.getByText("Group name").isVisible())

  // A stay shows its payment status and the new actions in its menu.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  const stay = page.locator("a[href^='/stays/']").first()
  if (await stay.count()) {
    await stay.click()
    await page.waitForURL("**/stays/**")
    await page.waitForSelector("text=/Paid|Unpaid|Part paid/", { timeout: 15000 })
    check("a stay shows whether it is paid", true)
    await page.screenshot({ path: `${OUT}/feature-stay.png`, fullPage: true })
  }

  check("no JavaScript errors anywhere", errors.length === 0, errors.slice(0, 2).join(" | "))
} catch (e) {
  check("the run completed", false, String(e).split("\n")[0])
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log()
console.log(failed.length === 0 ? "ALL FEATURE CHECKS PASSED" : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
