# Padav web design system

The bar is the occupancy card on Today: one idea per card, generous air, colour only where it carries
meaning, and nothing drawn by hand that the kit already provides. `src/components/__tests__/design-guard.test.ts`
fails the build when a screen drops below it.

## Surfaces

- **Card**: `rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]`, padding `p-5` (`p-4 md:p-5`
  when dense). Never `border border-line`. Use `Card`, `ListCard`, `StatTile` from `src/components/ui.tsx`.
- **Inset**: a block *inside* a card is `rounded-xl bg-surface-2`; rows inside a list are divided by
  `divide-y divide-line`, never boxed one by one.
- **Pressable surface**: add `press` (squash on tap) and `hover:shadow-[var(--shadow-card-hover)]`.
- **Chrome** (headers, rails, sticky bars) keeps a hairline `border-b`/`border-t border-line`; popovers
  (`Menu`, `SearchBox`) keep an edge. Those are the only borders.
- Corner radii: `--radius-card` (18px) for cards, `rounded-xl` (12px) for insets, `14px` for buttons and
  segmented tracks, `rounded-full` only for chips, avatars and dots. No `rounded-3xl`.

## Colour

- Every colour is a token in `src/app/globals.css`; no hex in a screen. Dark mode re-steps the tokens.
- One teal for everything interactive (`brand`, `brand-ink` for teal text). Status is a tint plus a word
  (`Chip`), never colour alone.
- Charts: `--color-chart` for one series; `--color-series-1`/`-2` for two, validated as a pair for
  colour-vision separation and 3:1 contrast. A state (out of service) is a hatched neutral, not a hue.
- Text never wears a series colour: labels `text-ink-soft`, values `text-ink`, numbers `tabular-nums`.

## Type and spacing

- Page title `PageHeader` (24px/800). Card title `text-[15px] font-semibold`. Group label `SectionLabel`
  (11px, uppercase, tracked, optional line icon). Body 15px. Small print `text-xs text-ink-soft`.
- Values that are read at a glance are `font-bold tabular-nums`; a big number is 26px+ with its word under it.
- Between page sections `space-y-4`; inside a card rows are `space-y-1.5`; a key/value row is
  `flex items-center justify-between gap-2`.
- Every control clears 44px; a legend swatch is `h-2.5 w-2.5 rounded-[3px]` in the series colour.

## Motion

- Motion answers an action: `press` on anything tappable, `anim-sheet`/`anim-pop` on overlays, `skeleton`
  while loading. One load-in moment per screen at most. All of it stands still under
  `prefers-reduced-motion`.
