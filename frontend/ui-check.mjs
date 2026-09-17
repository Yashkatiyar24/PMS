/**
 * Drives the real app in a real browser at phone size, the way the desk would use it.
 *
 * The unit tests and the HTTP smoke test both talk to the server directly, so neither notices when the
 * browser itself refuses to make the call — a missing CORS header once left every test green while nobody
 * could sign in. Run it against a dev server and a seeded database:
 *
 *   npm run dev   # in one terminal, with NEXT_PUBLIC_API_BASE pointing at the API
 *   npm run ui-check
 *
 * Screenshots land in ./ui-check-shots. Set PMS_UI_BASE and PMS_CHROMIUM to point elsewhere.
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

/**
 * Nothing may spill past the right edge. A checkbox once inherited the full-width styling meant for text
 * fields and pushed its own label off the screen; every tap target still cleared 44px, so only this catches
 * it. Ignores anything deliberately scrollable, like the tape chart.
 */
const overflows = async (where) => {
  const spills = await page.$$eval("body *", (nodes) =>
    nodes.filter((n) => {
      if (n.closest("[data-nextjs-dev-tools-button], nextjs-portal, .overflow-x-auto, .overflow-auto")) return false
      const r = n.getBoundingClientRect()
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1
    }).map((n) => `${n.tagName.toLowerCase()}.${n.className || "?"}`.slice(0, 60)))
  check(`nothing spills off the right edge on ${where}`, spills.length === 0, spills.slice(0, 3).join(" | "))
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 })
const page = await context.newPage()

// The login screen asks who you are before you have signed in, so its 401 is the expected answer,
// not a fault. Everything else that reaches the console is.
const errors = []
const expected = (text) => text.includes("401")
page.on("console", (m) => m.type() === "error" && !expected(m.text()) && errors.push(m.text()))
page.on("pageerror", (e) => errors.push(String(e)))

try {
  // 1. Login screen
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  check("the login screen renders", await page.getByRole("heading", { name: /धर्मशाला|Dharamshala/ }).isVisible())
  check("it opens in Hindi by default", (await page.locator("html").getAttribute("lang")) === "hi")

  // 2. Language toggle
  await page.getByRole("button", { name: /भाषा|Language/ }).click()
  check("one tap switches to English", (await page.locator("html").getAttribute("lang")) === "en")

  // 3. Sign in with email and password
  await page.getByRole("button", { name: /Use email and password/i }).click()
  await page.getByLabel("Email").fill("manager@pms.local")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  check("signing in lands on the today screen", page.url().endsWith("/"))
  await page.waitForSelector("text=/Staying now|Arriving today/", { timeout: 15000 })
  check("the today screen shows the desk's lists", await page.getByText(/Arriving today/).isVisible())
  await page.screenshot({ path: `${OUT}/ui-today.png`, fullPage: true })

  // 4. Tap targets are thumb-sized, as the PRD requires
  // Next's development toolbar injects a button of its own; it is not part of the app and never ships.
  const small = await page.$$eval("button:not([data-nextjs-dev-tools-button]), a[role='button'], label:has(> input[type=checkbox])", (nodes) =>
    nodes.filter((n) => n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < 44).length)
  check("every control clears the 44px tap target", small === 0, `${small} too small`)
  await overflows("the today screen")

  // 5. Check-in: a fresh screen asks for the guest only; naming them unfolds the room step, which the API fills
  await page.getByRole("button", { name: /Check-in/i }).first().click()
  await page.waitForURL("**/check-in")
  const folded = page.getByRole("button", { name: "Room and nights", expanded: false })
  await folded.waitFor({ timeout: 15000 })
  check("the check-in form starts with the guest step alone", await folded.isVisible())
  const choicesBefore = await page.locator("button[aria-pressed]").count()
  await page.getByLabel("Name", { exact: true }).fill("Smoke Test")
  await page.getByText("Adults").waitFor({ timeout: 15000 })
  await overflows("the check-in form")
  const units = (await page.locator("button[aria-pressed]").count()) - choicesBefore
  check("naming the guest unfolds the room step, with free rooms from the server", units > 1, `${units} choices`)
  await page.screenshot({ path: `${OUT}/ui-checkin.png`, fullPage: true })

  // 6. Navigation reaches the other screens
  await page.goto(`${BASE}/rooms`, { waitUntil: "networkidle" })
  check("housekeeping lists rooms by floor", await page.getByText(/Floor 1/).isVisible())
  await page.goto(`${BASE}/bookings`, { waitUntil: "networkidle" })
  await page.waitForSelector("table", { timeout: 15000 })
  check("the tape chart draws", (await page.locator("table tbody tr").count()) > 0,
        `${await page.locator("table tbody tr").count()} rows`)
  await page.screenshot({ path: `${OUT}/ui-chart.png`, fullPage: true })

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" })
  await page.waitForSelector("text=Rules", { timeout: 15000 })
  check("settings are generated from the registry", (await page.locator("input, select, textarea").count()) > 20,
        `${await page.locator("input, select, textarea").count()} controls`)

  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" })
  check("reports show the day's money", await page.getByText(/Today's collection/).isVisible())
  await page.screenshot({ path: `${OUT}/ui-reports.png`, fullPage: true })

  // 7. A laptop swaps the bottom bar for a rail, and the user menu switches the theme
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  check("a laptop gets the side rail", await page.locator("aside").getByRole("link", { name: "Today" }).isVisible())
  check("and loses the bottom bar", !(await page.locator("nav.fixed").isVisible()))
  await page.locator("aside button[aria-haspopup='menu']").click()
  await page.getByRole("menuitem", { name: /^Appearance:/ }).click()
  check("the user menu switches the theme", (await page.locator("html").getAttribute("data-theme")) !== null)
  await page.screenshot({ path: `${OUT}/ui-laptop.png`, fullPage: true })

  check("no JavaScript errors anywhere", errors.length === 0, errors.slice(0, 2).join(" | "))
} catch (e) {
  check("the run completed", false, String(e).split("\n")[0])
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log()
console.log(failed.length === 0 ? "ALL UI CHECKS PASSED" : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
