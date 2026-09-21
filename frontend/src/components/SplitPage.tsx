/**
 * The laptop layout every working screen shares: the main content on the left, and beside it a narrower
 * column that stays in view while the left scrolls, for the things a person keeps glancing at (a summary,
 * the filters, a photo, the one button that matters). A phone reads the same two parts top to bottom.
 *
 * Widths follow check-in and new booking, which set the pattern: a 20rem column beside a fluid one, splitting
 * only from `lg`, because between the phone and a laptop there is room for one column, not two.
 */
import { clsx } from "clsx"

export function SplitPage({
  aside,
  children,
  asideFirst,
}: {
  aside: React.ReactNode
  children: React.ReactNode
  /** On a phone, show the side column before the content: right for filters, wrong for a summary. */
  asideFirst?: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className={clsx("min-w-0 space-y-4 lg:sticky lg:top-24", asideFirst && "order-first lg:order-none")}>{aside}</aside>
    </div>
  )
}
