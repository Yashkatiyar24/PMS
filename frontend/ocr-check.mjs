/**
 * How much of an identity document the reader actually gets right.
 *
 * Five cards, drawn in the browser rather than kept as fixtures, each put through the whole live path: the
 * guest's own phone page, the real upload, the real on-device reader, the real field mapping. What is checked
 * is what lands in the form, which is the only thing that matters to the person standing at the desk.
 *
 * The cards are drawn on a grey background with mixed sizes and a little rotation, because a flat white
 * screenshot flatters the reader and a photograph of a card never looks like that. Expect a score, not a
 * pass: this is a measurement, and it prints which fields each card lost.
 *
 *   npm run dev
 *   PMS_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run ocr-check
 */
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

mkdirSync("ui-check-shots", { recursive: true })
const BASE = process.env.PMS_UI_BASE ?? "http://localhost:3000"
const API = process.env.PMS_API_BASE ?? "http://localhost:8080"

/** Each card: the lines printed on it, and what the register should end up holding. */
const CARDS = [
  {
    name: "Aadhaar",
    lines: ["भारत सरकार", "Government of India", "Rahul Sharma", "DOB: 14/03/1988", "Male",
      "1234 5678 9012", "Address: 12 Temple Road,", "Haridwar, Uttarakhand - 249401"],
    expect: { name: "Rahul Sharma", dob: "1988-03-14", gender: "male", idType: "aadhaar", idLast4: "9012", state: "Uttarakhand", pincode: "249401" },
  },
  {
    name: "PAN",
    lines: ["INCOME TAX DEPARTMENT", "GOVT. OF INDIA", "Name", "SUNIL KUMAR VERMA",
      "Father's Name", "RAMESH VERMA", "ABCDE1234F", "Date of Birth", "01/01/1990"],
    expect: { name: "SUNIL KUMAR VERMA", dob: "1990-01-01", idType: "pan", idLast4: "234F" },
  },
  {
    name: "Voter ID",
    lines: ["ELECTION COMMISSION OF INDIA", "IDENTITY CARD", "Elector's Name: Meena Devi",
      "Father's Name: Shiv Lal", "Sex: Female", "Date of Birth: 22/07/1975", "ABC1234567"],
    expect: { name: "Meena Devi", dob: "1975-07-22", gender: "female", idType: "voter", idLast4: "4567" },
  },
  {
    name: "Driving Licence",
    lines: ["TRANSPORT DEPARTMENT", "DRIVING LICENCE", "DL No: HR-0619850034761",
      "Name: Arjun Singh", "DOB: 09/11/1985", "Address: 45 Mall Road,", "Shimla, Himachal Pradesh - 171001"],
    expect: { name: "Arjun Singh", dob: "1985-11-09", idType: "dl", state: "Himachal Pradesh", pincode: "171001" },
  },
  {
    name: "Passport",
    lines: ["REPUBLIC OF INDIA", "PASSPORT", "Type P", "Country Code IND",
      "Passport No. Z1234567", "Surname RAO", "Given Names ARJUN", "Nationality INDIAN",
      "Date of Birth 02/02/1980", "Sex M"],
    expect: { idType: "passport", dob: "1980-02-02", idLast4: "4567", nationality: "IN" },
  },
]

const browser = await chromium.launch(process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {})
const desk = await browser.newContext()
const deskPage = await desk.newPage()
await deskPage.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await deskPage.request.post(`${API}/api/auth/login`, {
  headers: { "X-Requested-With": "pms" },
  data: { code: process.env.PMS_CODE ?? "SRD1001", email: "owner@pms.local", password: "password123" },
})

const results = []
for (const card of CARDS) {
  const link = await (await deskPage.request.post(`${API}/api/registrations`, {
    headers: { "X-Requested-With": "pms" }, data: { bookingId: null },
  })).json()
  const token = link.url.slice(link.url.lastIndexOf("/") + 1)

  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const guest = await guestCtx.newPage()
  await guest.goto(`${BASE}/g/${token}`, { waitUntil: "networkidle" })
  await guest.getByLabel(/पूरा नाम|Full name/).waitFor({ timeout: 20000 })

  // The card as a photograph of a card, not a screenshot of one: a smaller frame than the print deserves,
  // one side lit brighter than the other, camera noise, a little shake and the whole thing slightly turned.
  // A crisp rendering flatters any reader; this is roughly what a phone in a lobby actually hands over.
  await guest.evaluate(async (lines) => {
    const c = document.createElement("canvas")
    c.width = 1000
    c.height = 630
    const d = c.getContext("2d")
    d.fillStyle = "#d9d5cd"
    d.fillRect(0, 0, c.width, c.height)
    d.save()
    d.translate(c.width / 2, c.height / 2)
    d.rotate(-0.025)
    d.translate(-c.width / 2, -c.height / 2)
    d.fillStyle = "#f7f5f1"
    d.fillRect(26, 26, c.width - 52, c.height - 52)
    d.filter = "blur(0.9px)"           // the hand holding the phone
    d.fillStyle = "#1b1b1b"
    lines.forEach((line, i) => {
      const big = /^[A-Z\u0900-\u097F][^:]*$/.test(line) && line.length < 26 && i < 4
      d.font = `${big ? "bold " : ""}${big ? 33 : 28}px Helvetica, Arial`
      d.fillText(line, 54, 92 + i * 55)
    })
    d.filter = "none"
    d.restore()

    // Window light across the card, then sensor noise.
    const light = d.createLinearGradient(0, 0, c.width, c.height)
    light.addColorStop(0, "rgba(255,255,255,0.42)")
    light.addColorStop(0.55, "rgba(255,255,255,0)")
    light.addColorStop(1, "rgba(0,0,0,0.30)")
    d.fillStyle = light
    d.fillRect(0, 0, c.width, c.height)
    const frame = d.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < frame.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26
      frame.data[i] += n
      frame.data[i + 1] += n
      frame.data[i + 2] += n
    }
    d.putImageData(frame, 0, 0)

    const blob = await new Promise((done) => c.toBlob(done, "image/jpeg", 0.75))
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], "id.jpg", { type: "image/jpeg" }))
    const input = document.querySelector("input[type=file]")
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }, card.lines)

  // The reader runs on the phone; wait for it to finish rather than for any single field.
  await guest.getByText(/फोटो भेज दी गई|Photo sent/).waitFor({ timeout: 30000 })
  await guest.getByText(/जाँच लें|please check|फ़ोटो से पढ़ा|Read from the photo|पढ़ी नहीं जा सकी|Could not read/)
    .first().waitFor({ timeout: 90000 }).catch(() => {})

  // What the desk's screen now holds, which is the thing being measured: the draft the guest's phone wrote,
  // and the suggestions beside the fields it would not overwrite.
  const session = await (await deskPage.request.get(`${API}/api/registrations/${link.id}`, { headers: { "X-Requested-With": "pms" } })).json()

  // ...and, for the fields the guest form shows, that the value really is in the box on their phone.
  const onPhone = {}
  for (const [field, label] of Object.entries({
    name: /पूरा नाम|Full name/, city: /शहर या गाँव|City or village/, state: /^राज्य$|^State$/,
    pincode: /पिन कोड|PIN code/, dob: /जन्म तिथि|Date of birth/, idLast4: /आखिरी 4 अंक|Last 4 digits/,
  }))
    // null when the form has no such box at all; "" when it has one and nothing was filled into it.
    onPhone[field] = await guest.getByLabel(label).first().inputValue().catch(() => null)

  const scored = Object.entries(card.expect).map(([field, want]) => {
    const inDraft = String(session.draft?.[field] ?? "").trim()
    const suggested = String(session.ocr?.[field]?.value ?? "").trim()
    const value = inDraft || suggested
    const ok = value.toLowerCase() === String(want).toLowerCase()
    // A field the guest's form shows must end up in the box, not merely in the draft: an extracted value the
    // person cannot see is not "filled in automatically".
    const box = onPhone[field]
    const filled = box === null || box === undefined ? null : box.trim().toLowerCase() === String(want).toLowerCase()
    return { field, want, value, ok: ok && filled !== false, read: ok, filled, confidence: session.ocr?.[field]?.confidence ?? null }
  })
  const hit = scored.filter((s) => s.ok).length
  results.push({ card: card.name, hit, of: scored.length, scored, doc: session.ocr?._doc ?? "" })
  console.log(`\n${card.name}: ${hit}/${scored.length} fields  (recognised as "${session.ocr?._doc ?? "?"}")`)
  for (const s of scored)
    console.log(`  ${s.ok ? "✓" : "✗"} ${s.field}: ${JSON.stringify(s.value)}${s.ok ? "" : ` (wanted ${JSON.stringify(s.want)})`}` +
      `${s.confidence != null ? ` conf ${s.confidence}` : ""}` +
      `${s.read && s.filled === false ? `  [read, but the box on the phone says ${JSON.stringify(onPhone[s.field])}]` : ""}`)
  await guest.screenshot({ path: `ui-check-shots/ocr-${card.name.replace(/\s+/g, "-").toLowerCase()}.png`, fullPage: true })
  await guestCtx.close()
}

const hit = results.reduce((n, r) => n + r.hit, 0)
const of = results.reduce((n, r) => n + r.of, 0)
console.log(`\nTOTAL ${hit}/${of} fields read correctly (${Math.round((hit * 100) / of)}%)`)
await browser.close()
process.exit(hit === of ? 0 : 1)
