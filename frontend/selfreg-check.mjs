/**
 * The register-book handover, driven as it actually happens: two devices.
 *
 * The desk's browser and the guest's phone are separate browser contexts with separate cookie jars, because
 * that is the whole point — the guest is not signed in and never will be. A single-context test would carry
 * the desk's session onto the guest's page and prove nothing.
 *
 * Runs against a dev server and a seeded database, and leaves one checked-in stay behind:
 *
 *   npm run dev
 *   PMS_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run selfreg-check
 */
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { chromium } from "playwright"

const require_ = createRequire(import.meta.url)
mkdirSync("ui-check-shots", { recursive: true })

const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const API = process.env.PMS_API_BASE ?? "http://localhost:8080"
const results = []
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`)
}

/** The smallest valid PNG there is: one white pixel. Stands in for the guest's photo of their ID. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64")

/** Nothing may spill past the right edge of the phone; a stepper's + button once did. */
const overflows = async (page, where) => {
  const spills = await page.$$eval("body *", (nodes) =>
    nodes.filter((n) => {
      if (n.closest("[data-nextjs-dev-tools-button], nextjs-portal, .overflow-x-auto, .overflow-auto")) return false
      const r = n.getBoundingClientRect()
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1
    }).map((n) => `${n.tagName.toLowerCase()}.${n.className || "?"}`.slice(0, 60)))
  check(`nothing spills off the right edge of ${where}`, spills.length === 0, spills.slice(0, 3).join(" | "))
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 }

const deskCtx = await browser.newContext({ ...phone, permissions: ["clipboard-read", "clipboard-write"] })
const guestCtx = await browser.newContext(phone)   // a different phone: no session, no cookies
const desk = await deskCtx.newPage()
const guest = await guestCtx.newPage()

const errors = []
for (const [who, page] of [["desk", desk], ["guest", guest]]) {
  page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(`${who}: ${m.text()}`))
  page.on("pageerror", (e) => errors.push(`${who}: ${e}`))
}

try {
  // --- The desk signs in and opens check-in ---
  await desk.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await desk.getByRole("button", { name: /भाषा|Language/ }).click()
  await desk.getByRole("button", { name: /Sign in/i }).first().click()
  await desk.getByRole("tab", { name: /Email/ }).click()
  await desk.getByLabel("Email").fill("manager@pms.local")
  await desk.getByLabel("Password").fill("password123")
  await desk.getByRole("dialog").getByRole("button", { name: "Sign in", exact: true }).click()
  await desk.waitForURL(`${BASE}/`, { timeout: 15000 })
  await desk.getByRole("button", { name: /Check-in/i }).first().click()
  await desk.waitForURL("**/check-in")

  // --- The desk finds the QR already on screen, with nothing to press ---
  const qrImage = desk.locator("img[alt*='scan' i]")
  await qrImage.waitFor({ timeout: 15000 })
  check("the QR is on screen as soon as check-in opens", await qrImage.isVisible())
  const src = await qrImage.getAttribute("src")
  check("a QR code is drawn by the server", Boolean(src?.startsWith("data:image/png;base64,")))
  const box = await qrImage.boundingBox()
  check("the code is big enough to scan across a desk", (box?.width ?? 0) >= 200, `${Math.round(box?.width ?? 0)}px`)
  check("the desk is told it is waiting", await desk.getByText(/Waiting for the guest/i).isVisible())
  await desk.screenshot({ path: "ui-check-shots/selfreg-desk-qr.png", fullPage: true })

  // --- Decode the QR the way a phone camera would, rather than trusting a link we already knew ---
  // jsQR is injected from node_modules rather than a CDN: this must run with no internet.
  await desk.addScriptTag({ path: require_.resolve("jsqr/dist/jsQR.js") })
  const link = await desk.evaluate(async (dataUri) => {
    const img = new Image()
    img.src = dataUri
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext("2d").drawImage(img, 0, 0)
    const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, img.width, img.height)
    return window.jsQR(data, width, height)?.data ?? null
  }, src)
  check("the code scans to a working link", Boolean(link && link.includes("/g/")), link ? new URL(link).pathname.slice(0, 20) + "…" : "unreadable")

  // --- Tapping the code copies the same link, for the guest whose camera will not scan ---
  await desk.getByRole("button", { name: /copy the link/i }).click()
  await desk.getByText(/Link copied/i).waitFor({ timeout: 5000 })
  const copied = await desk.evaluate(() => navigator.clipboard.readText())
  check("tapping the code puts the link on the clipboard", copied === link, copied === link ? "" : copied.slice(0, 40))

  // --- The guest's phone, with no account ---
  await guest.goto(link, { waitUntil: "networkidle" })
  check("the guest is not bounced to a login screen", !guest.url().includes("/login"), guest.url().replace(BASE, ""))
  check("the form greets them with the property name", await guest.getByText("Shri Ram Dharamshala").isVisible())
  check("it has a heading in the property's guest language", await guest.getByRole("heading", { name: /अपनी जानकारी भरें|Fill in your details/ }).isVisible())

  const cookies = await guestCtx.cookies()
  check("the guest carries no session cookie", !cookies.some((c) => c.name === "pms_session"), `${cookies.length} cookies`)

  const guestName = `Selfreg ${Date.now() % 100000}`
  await guest.getByLabel(/पूरा नाम|Full name/).fill(guestName)
  await guest.getByLabel(/मोबाइल नंबर|Mobile number/).fill("9812345678")
  await guest.getByLabel(/शहर या गाँव|City or village/).fill("Rishikesh")
  await guest.getByLabel(/^पता$|^Address$/).fill("22 Ganga Marg")
  await guest.getByLabel(/आखिरी 4 अंक|Last 4 digits/).fill("7788")
  await guest.getByRole("button", { name: /और जोड़ें|Add another/ }).click()
  await guest.getByPlaceholder(/^नाम$|^Name$/).fill("Ram Prasad")
  await overflows(guest, "the guest's form")

  // Their own photo of their own ID, taken before they save.
  const photoInput = guest.locator("input[type=file]")
  const asksPhoto = (await photoInput.count()) > 0
  if (asksPhoto) {
    await photoInput.setInputFiles({ name: "id.png", mimeType: "image/png", buffer: PNG })
    await guest.getByText(/फोटो भेज दी गई|Photo sent/).waitFor({ timeout: 15000 })
    check("the guest's ID photo is accepted before they save", true)
  }

  for (const boxEl of await guest.locator("input[type=checkbox]").all()) await boxEl.check()
  const cbox = await guest.locator("input[type=checkbox]").first().boundingBox()
  check("the consent tick box is a tick box, not a text field", (cbox?.width ?? 999) < 40, `${Math.round(cbox?.width ?? 0)}px wide`)
  await guest.screenshot({ path: "ui-check-shots/selfreg-guest-form.png", fullPage: true })

  // --- The guest saves. They cannot check themselves in: the button says save, and the desk finishes ---
  const save = guest.getByRole("button", { name: /^सेव करें$|^Save$/ })
  check("the guest's only button saves; it does not submit a check-in", await save.isVisible())
  await save.click()
  await guest.getByText(/सेव हो गया|Saved/).first().waitFor({ timeout: 15000 })
  check("the guest is told it is saved and the desk will finish", await guest.getByText(/चेक-इन वहीं पूरा होगा|complete your check-in/).isVisible())
  await guest.screenshot({ path: "ui-check-shots/selfreg-guest-done.png", fullPage: true })

  // --- Back at the desk, without anyone pressing refresh ---
  await desk.getByText(/Details received from/i).waitFor({ timeout: 20000 })
  check("the desk notices without being touched", true)
  const filledName = await desk.getByLabel("Name").first().inputValue()
  check("the guest's own words fill the desk's form", filledName === guestName, filledName)
  const filledCity = await desk.getByLabel("City or village").inputValue()
  check("so does the rest of it", filledCity === "Rishikesh", filledCity)
  if (asksPhoto) check("the desk sees the guest's ID photo arrived", await desk.getByText(/ID photo received/i).first().isVisible())
  await desk.screenshot({ path: "ui-check-shots/selfreg-desk-filled.png", fullPage: true })

  // --- The desk picks a bed and completes the check-in; the guest record carries the guest's photo ---
  check("until a bed is picked, the desk is told why the button waits", await desk.getByText(/Pick a room or bed/i).locator("visible=true").isVisible())
  // The room buttons live in the scrollable list; the ID-type chips are aria-pressed too, so be specific.
  const room = desk.locator(".scroll-thin button[aria-pressed]").first()
  await room.waitFor({ timeout: 15000 })
  await room.click()
  const complete = desk.getByRole("button", { name: /Complete check-in/i }).first()
  check("the desk can complete without retaking the photo or typing a reason", await complete.isEnabled())
  await complete.click()
  await desk.waitForURL("**/stays/**", { timeout: 20000 })
  check("the check-in lands on the stay", true)
  const stayId = desk.url().split("/stays/")[1].split("?")[0]
  const guestRecord = await desk.evaluate(async ({ api, stayId }) => {
    const booking = await (await fetch(`${api}/api/bookings/${stayId}`, { credentials: "include" })).json()
    return (await fetch(`${api}/api/guests/${booking.guestId}`, { credentials: "include" })).json()
  }, { api: API, stayId })
  check("the stay's guest is the one who filled the form", guestRecord.name === guestName, guestRecord.name)
  if (asksPhoto) check("their ID photo is on the guest record", guestRecord.hasIdPhoto === true, String(guestRecord.hasIdPhoto))

  // --- The link is spent ---
  await guest.goto(link, { waitUntil: "networkidle" })
  const spent = await guest.getByText(/सेव हो गया|Saved/).first().isVisible().catch(() => false)
  check("a second scan of the same code cannot re-file it", spent)

  check("no JavaScript errors on either device", errors.length === 0, errors.slice(0, 2).join(" | "))
} catch (e) {
  check("the run completed", false, String(e).split("\n")[0])
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log()
console.log(failed.length === 0 ? "ALL SELF-REGISTRATION CHECKS PASSED" : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
