import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The design system is a contract, and this is what enforces it. A screen that draws its own bordered box,
 * types a hex colour, or sizes a card with a radius the kit does not use fails the build; the fix is to use
 * the kit (Card, ListCard, SectionLabel, StatTile) and the tokens in globals.css. See DESIGN.md.
 */
const SRC = join(__dirname, "..", "..")

/** Pieces that legitimately need an edge or a literal: popovers, the outlined button, pinned brand colours. */
const ALLOW_BORDER = ["components/ui.tsx", "components/SearchBox.tsx"]
const ALLOW_HEX = ["app/layout.tsx", "app/login/page.tsx", "app/login/Landing.tsx", "app/manifest.ts"]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") walk(full, out)
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) out.push(full)
  }
  return out
}

const files = [...walk(join(SRC, "app")), ...walk(join(SRC, "components"))].map((f) => ({ rel: relative(SRC, f), text: readFileSync(f, "utf8") }))

describe("design system guard", () => {
  it("draws cards and lists with a shadow, never a hairline border", () => {
    const offenders = files
      .filter((f) => !ALLOW_BORDER.includes(f.rel))
      .flatMap((f) =>
        f.text
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /\bborder border-(line|line-strong)\b/.test(line) && !/border-dashed/.test(line))
          .map(({ n }) => `${f.rel}:${n}`),
      )
    expect(offenders).toEqual([])
  })

  it("takes every colour from the tokens in globals.css", () => {
    const offenders = files
      .filter((f) => !ALLOW_HEX.includes(f.rel))
      .flatMap((f) =>
        f.text
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /#[0-9a-fA-F]{6}\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
          .map(({ n }) => `${f.rel}:${n}`),
      )
    expect(offenders).toEqual([])
  })

  it("only reads CSS variables that globals.css defines", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8")
    const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
    const offenders = files.flatMap((f) =>
      [...f.text.matchAll(/var\((--[a-z0-9-]+)\)/g)]
        .map((m) => m[1])
        .filter((v) => !defined.has(v) && !/^--(depth|font-)/.test(v))
        .map((v) => `${f.rel}: ${v}`),
    )
    expect([...new Set(offenders)]).toEqual([])
  })

  it("uses the kit's corner radii on containers", () => {
    const offenders = files.flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /\brounded-3xl\b/.test(line))
        .map(({ n }) => `${f.rel}:${n}`),
    )
    expect(offenders).toEqual([])
  })
})
