/**
 * The register-book handover, driven as it actually happens: two devices.
 *
 * The desk's browser and the guest's phone are separate browser contexts with separate cookie jars, because
 * that is the whole point — the guest is not signed in and never will be. A single-context test would carry
 * the desk's session onto the guest's page and prove nothing.
 */
import { chromium } from "playwright"
import { createRequire } from "node:module"

const require_ = createRequire(import.meta.url)

const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const results = []
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`)
}

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 }

const deskCtx = await browser.newContext(phone)
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
  await desk.getByRole("button", { name: /Use email and password/i }).click()
  await desk.getByLabel("Email").fill("manager@pms.local")
  await desk.getByLabel("Password").fill("password123")
  await desk.getByRole("button", { name: "Sign in", exact: true }).click()
  await desk.waitForURL(`${BASE}/`, { timeout: 15000 })
  await desk.getByRole("button", { name: /Check-in/i }).first().click()
  await desk.waitForURL("**/check-in")
  await desk.waitForSelector("select", { timeout: 15000 })

  // --- The desk offers the QR ---
  const qrButton = desk.getByRole("button", { name: /Guest fills their own details/i })
  check("the desk is offered the QR handover", await qrButton.isVisible())
  await qrButton.click()

  const qrImage = desk.locator("img[alt*='scan' i]")
  await qrImage.waitFor({ timeout: 15000 })
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

  // --- The guest's phone, with no account ---
  await guest.goto(link, { waitUntil: "networkidle" })
  check("the guest is not bounced to a login screen", !guest.url().includes("/login"), guest.url().replace(BASE, ""))
  check("the form greets them with the property name", await guest.getByText("Shri Ram Dharamshala").isVisible())
  check("it opens in Hindi", await guest.getByRole("heading", { name: "अपनी जानकारी भरें" }).isVisible())

  const cookies = await guestCtx.cookies()
  check("the guest carries no session cookie", !cookies.some((c) => c.name === "pms_session"), `${cookies.length} cookies`)

  await guest.getByLabel("पूरा नाम").fill("लक्ष्मी देवी")
  await guest.getByLabel("मोबाइल नंबर").fill("9812345678")
  await guest.getByLabel("शहर या गाँव").fill("Rishikesh")
  await guest.getByLabel("पता").fill("22 Ganga Marg")
  await guest.getByLabel("पहचान पत्र के आखिरी 4 अंक").fill("7788")
  await guest.getByRole("button", { name: "और जोड़ें" }).click()
  await guest.getByPlaceholder("नाम").fill("राम प्रसाद")
  const consent = guest.locator("input[type=checkbox]").first()
  await consent.check()
  const cbox = await consent.boundingBox()
  check("the consent tick box is a tick box, not a text field", (cbox?.width ?? 999) < 40, `${Math.round(cbox?.width ?? 0)}px wide`)
  await guest.screenshot({ path: "ui-check-shots/selfreg-guest-form.png", fullPage: true })

  await guest.getByRole("button", { name: "भेजें" }).click()
  await guest.getByText("धन्यवाद").waitFor({ timeout: 15000 })
  check("the guest is thanked and sent to the desk", true)
  await guest.screenshot({ path: "ui-check-shots/selfreg-guest-done.png", fullPage: true })

  // --- Back at the desk, without anyone pressing refresh ---
  await desk.getByText(/Details received from/i).waitFor({ timeout: 20000 })
  check("the desk notices without being touched", true)
  const filledName = await desk.getByLabel("Name").first().inputValue()
  check("the guest's own words fill the desk's form", filledName === "लक्ष्मी देवी", filledName)
  const filledCity = await desk.getByLabel("City or village").inputValue()
  check("so does the rest of it", filledCity === "Rishikesh", filledCity)
  await desk.screenshot({ path: "ui-check-shots/selfreg-desk-filled.png", fullPage: true })

  // --- The link is spent ---
  await guest.goto(link, { waitUntil: "networkidle" })
  const spent = await guest.getByText("धन्यवाद").isVisible().catch(() => false)
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
