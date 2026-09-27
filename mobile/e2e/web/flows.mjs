/** Desk actions the run strings together; each works on the stay that is on screen. */
import { clickTop, topOf } from "./harness.mjs"

const text = (page, s) => page.getByText(s, { exact: true })
const menuItem = (page, s) => page.getByRole("menuitem", { name: s, exact: true })

/** Walk-in check-in of `name` into the first free Non-AC (else AC) room; ends on the new stay. */
export async function walkIn(page, name, phone) {
  await clickTop(page.getByTestId("today-checkin"))
  await (await topOf(page.getByTestId("guest-name"))).fill(name)
  await (await topOf(page.getByTestId("guest-phone"))).fill(phone)
  for (const [type, rooms] of [
    ["Non-AC Room · ₹800", range(101, 110)],
    ["AC Room · ₹1,500", range(201, 208)],
  ]) {
    await clickTop(text(page, type))
    await page.waitForTimeout(800)
    for (const r of rooms) {
      if (await text(page, r).locator("visible=true").count()) {
        await clickTop(text(page, r))
        const skip = page.getByTestId("checkin-skip-reason")
        if (await skip.locator("visible=true").count())
          await (await topOf(skip)).fill("Guest forgot ID")
        const consent = text(page, "I have told the guest why their details are being recorded.")
        if (await consent.locator("visible=true").count()) await clickTop(consent)
        await clickTop(page.getByTestId("checkin-submit"))
        await page
          .getByTestId("stay-menu")
          .locator("visible=true")
          .first()
          .waitFor({ timeout: 20000 })
        return r
      }
    }
  }
  throw new Error("no free room to check into")
}

export async function addCharge(page, description, rupees) {
  await clickTop(page.getByTestId("stay-menu"))
  await clickTop(menuItem(page, "Add charge"))
  await (await topOf(page.getByTestId("extra-details"))).fill(description)
  await (await topOf(page.getByTestId("extra-amount"))).fill(String(rupees))
  await clickTop(page.getByTestId("extra-submit"))
  await clickTop(text(page, "Bill"))
  await text(page, description).locator("visible=true").first().waitFor({ timeout: 10000 })
}

/** Open the remove sheet on the only added charge and fill the reason (and a PIN when asked). */
export async function removeCharge(page, description, { pin } = {}) {
  const buttons = page.locator('[data-testid^="remove-line-"]').locator("visible=true")
  if ((await buttons.count()) !== 1)
    throw new Error(`expected one removable line, saw ${await buttons.count()}`)
  await clickTop(buttons)
  await (await topOf(page.getByTestId("remove-line-reason"))).fill("Entered by mistake")
  if (pin) await (await topOf(page.locator('input[type="password"]'))).fill(pin)
  await clickTop(page.getByTestId("remove-line-submit"))
  await page.waitForTimeout(1500)
  return !(await text(page, description).locator("visible=true").count())
}

/** Take the balance, check out, and refund first when the server says the guest overpaid. */
export async function settleAndCheckOut(page) {
  if (await page.getByTestId("stay-pay").locator("visible=true").count()) {
    await clickTop(page.getByTestId("stay-pay"))
    await clickTop(page.getByTestId("pay-submit"))
    await page.waitForTimeout(1500)
  }
  await clickTop(page.getByTestId("stay-checkout"))
  await page.waitForTimeout(1500)
  const overpaid = (await page.locator("body").innerText()).match(/overpaid by ₹([\d,]+)/)
  if (overpaid) {
    await clickTop(page.getByTestId("stay-menu"))
    await clickTop(menuItem(page, "Refund"))
    await (await topOf(page.getByTestId("money-amount"))).fill(overpaid[1].replace(/,/g, ""))
    await (await topOf(page.getByTestId("money-reason"))).fill("Left the same day")
    await clickTop(page.getByTestId("money-submit"))
    await page.waitForTimeout(1500)
    await clickTop(page.getByTestId("stay-checkout"))
  }
  await text(page, "Checked out").locator("visible=true").first().waitFor({ timeout: 20000 })
}

export async function openStayBySearch(page, name) {
  await clickTop(page.getByText("⌕"))
  await (await topOf(page.getByTestId("search-input"))).fill(name)
  await page.waitForTimeout(1500)
  await clickTop(text(page, name))
  await page.getByTestId("stay-menu").locator("visible=true").first().waitFor({ timeout: 15000 })
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
}
