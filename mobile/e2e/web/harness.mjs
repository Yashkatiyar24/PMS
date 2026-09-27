/**
 * A tiny Playwright harness for driving the app's web build (react-native-web) against a running API. It borrows
 * the web frontend's Playwright install, so the mobile app adds no dependency for it.
 */
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(
  fileURLToPath(new URL("../../../frontend/package.json", import.meta.url)),
)
const { chromium } = require("playwright")

export const APP = process.env.PMS_APP_URL ?? "http://localhost:8081"
export const API = process.env.PMS_API_ORIGIN ?? "http://localhost:8080"

export async function open(outDir) {
  const browser = await chromium.launch(
    process.env.PMS_CHROMIUM ? { executablePath: process.env.PMS_CHROMIUM } : {},
  )
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  })
  const problems = []
  const writes = []
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    // Reactotron's dev socket is not running here; everything else is a real error.
    if (
      m.type() === "error" &&
      !m.text().includes(":9090") &&
      !m.text().includes("Failed to load resource")
    )
      problems.push(`console: ${m.text().slice(0, 300)}`)
  })
  page.on("response", (r) => {
    if (!r.url().startsWith(API)) return
    const line = `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`
    if (r.request().method() !== "GET") writes.push(line)
    if (r.status() >= 500 || (r.status() >= 400 && !page.expecting?.has(r.status())))
      problems.push(`http ${line}`)
  })
  page.expecting = new Set()
  let n = 0
  const shot = (name) =>
    page.screenshot({
      timeout: 10000,
      path: `${outDir}/${String(++n).padStart(2, "0")}-${name}.png`,
    })
  const results = []
  /** One named step: passes when it finishes with no new page, console or HTTP problem and no error state. */
  async function step(name, fn, { expect = [] } = {}) {
    const before = problems.length
    page.expecting = new Set(expect)
    try {
      await fn()
      if (/Something went wrong/i.test(await page.locator("body").innerText()))
        throw new Error("an error state is on screen")
      const fresh = problems.slice(before)
      results.push(fresh.length ? `FAIL ${name} :: ${fresh.join(" ; ")}` : `PASS ${name}`)
    } catch (e) {
      results.push(`FAIL ${name}: ${e.message.split("\n")[0]}`)
    }
    page.expecting = new Set()
    await page.waitForTimeout(600)
    await shot(name.replace(/\W+/g, "-").slice(0, 60)).catch(() => {})
    console.log(results[results.length - 1])
  }
  return { browser, page, shot, step, results, writes }
}

/** Click the match that is really on top at its centre: inactive tab screens stay laid out on web. */
export async function clickTop(locator, timeout = 10000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const count = await locator.count()
    for (let i = 0; i < count; i++) {
      const el = locator.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {})
      const onTop = await el
        .evaluate((node) => {
          const r = node.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return false
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return !!hit && (node === hit || node.contains(hit))
        })
        .catch(() => false)
      if (onTop) return el.click()
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`nothing on top for ${locator}`)
}

/** The first match that is on top, for typing into. */
export async function topOf(locator, timeout = 10000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const count = await locator.count()
    for (let i = 0; i < count; i++)
      if (
        await locator
          .nth(i)
          .isVisible()
          .catch(() => false)
      )
        return locator.nth(i)
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`nothing visible for ${locator}`)
}

/** Sign in through the form (English), landing on the element with `landing` as its test id. */
export async function signIn(page, { email, code = "SRD1001", landing = "today-checkin" }) {
  await page.goto(APP, { waitUntil: "networkidle", timeout: 120000 })
  const en = page.getByText("EN", { exact: true })
  if (await en.isVisible().catch(() => false)) await en.click()
  await page.getByTestId("login-code").fill(code)
  await page.getByTestId("login-email").fill(email)
  await page.getByTestId("login-password").fill("password123")
  await page.getByTestId("login-submit").click()
  if (landing) await page.getByTestId(landing).first().waitFor({ timeout: 30000 })
  else await page.waitForTimeout(4000)
}

/** Back out of pushed screens until the tab's root is showing. */
export async function backToRoot(page, times = 4) {
  for (let i = 0; i < times; i++) {
    const done = await clickTop(page.getByLabel("Back"), 2000).then(
      () => false,
      () => true,
    )
    if (done) return
    await page.waitForTimeout(600)
  }
}

export async function signOut(page) {
  await backToRoot(page)
  await clickTop(page.getByTestId("user-menu"))
  await clickTop(page.getByRole("menuitem", { name: "Log out", exact: true }))
  await page.getByTestId("login-submit").waitFor({ timeout: 15000 })
}
