"use client"

/**
 * The kit every screen is built from. Sized for a thumb, legible in daylight, quiet until asked.
 *
 * The rule the kit enforces: a screen shows its status and its one main action; every other form lives in
 * a Sheet and every other action in a Menu, so nothing is on screen that the desk did not ask for.
 */
import * as Dialog from "@radix-ui/react-dialog"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Info, Inbox, MoreHorizontal, X, XCircle } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
export type Tone = "neutral" | "brand" | "teal" | "violet" | "ok" | "warn" | "danger" | "info"

/** Solid, soft and text colours for each tone, so a component never has to know a hex. */
export const TONE = {
  neutral: { solid: "bg-ink-soft", soft: "bg-surface-2", text: "text-ink-soft", border: "border-line" },
  brand: { solid: "bg-brand", soft: "bg-brand-soft", text: "text-brand-ink", border: "border-brand" },
  teal: { solid: "bg-teal", soft: "bg-teal-soft", text: "text-teal", border: "border-teal" },
  violet: { solid: "bg-violet", soft: "bg-violet-soft", text: "text-violet", border: "border-violet" },
  ok: { solid: "bg-ok", soft: "bg-ok-soft", text: "text-ok", border: "border-ok" },
  warn: { solid: "bg-warn", soft: "bg-warn-soft", text: "text-warn", border: "border-warn" },
  danger: { solid: "bg-danger", soft: "bg-danger-soft", text: "text-danger", border: "border-danger" },
  info: { solid: "bg-info", soft: "bg-info-soft", text: "text-info", border: "border-info" },
} as const satisfies Record<Tone, { solid: string; soft: string; text: string; border: string }>

/* ---------------------------------------------------------------- buttons */

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "soft" | "danger" | "ghost"
  size?: "sm" | "md" | "lg"
}) {
  // The main action is an ink pill; blue is kept for what is selected, so the two never compete.
  const styles = {
    primary: "bg-ink text-bg shadow-sm hover:bg-ink/85",
    secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
    soft: "bg-brand-soft text-brand-ink hover:brightness-95",
    danger: "bg-danger text-on-solid hover:brightness-95",
    ghost: "bg-transparent text-brand-ink hover:bg-brand-soft",
  }[variant]
  const sizes = {
    sm: "min-h-[36px] px-3.5 py-1.5 text-sm",
    md: "min-h-[44px] px-5 py-2.5 text-[15px]",
    lg: "min-h-[52px] px-6 py-3 text-base",
  }[size]
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,transform,filter] duration-100",
        "disabled:opacity-45 disabled:pointer-events-none active:scale-[.985]",
        styles,
        sizes,
        className,
      )}
    />
  )
}

export function IconButton({ label, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink",
        "disabled:opacity-45 disabled:pointer-events-none",
        className,
      )}
    />
  )
}

/* ---------------------------------------------------------------- layout */

/** The house mark, in ink like the buttons. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-ink text-bg">
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
      </svg>
    </span>
  )
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  back?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <header className="mb-4 flex items-start gap-2">
      {back && (
        <Link href={back} aria-label={t("action.back")} className="-ml-2 mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2">
          <ArrowLeft size={20} aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

export function Card({
  className,
  title,
  action,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      {...props}
      className={clsx("rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]", className)}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

/** A short label above a group, the way a settings screen reads. */
export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-1 flex items-center justify-between gap-2 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{children}</h2>
      {right}
    </div>
  )
}

/** Big number with a colour and a word: what the desk reads at a glance. */
export function StatTile({
  label,
  value,
  tone = "brand",
  icon: Icon,
  hint,
  href,
  onClick,
  active,
}: {
  label: string
  value: React.ReactNode
  tone?: Tone
  icon?: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  hint?: React.ReactNode
  href?: string
  onClick?: () => void
  active?: boolean
}) {
  const t = TONE[tone]
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* Wraps rather than truncates: "Arriving tod…" hides the one word that matters, more so in Hindi. */}
        <span className="min-w-0 pt-1 text-xs font-semibold uppercase leading-tight tracking-wide text-ink-soft">{label}</span>
        {Icon && (
          <span className={clsx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.soft, t.text)}>
            <Icon size={15} aria-hidden />
          </span>
        )}
      </div>
      <p className={clsx("mt-1.5 text-[26px] font-bold leading-none tabular-nums tracking-tight", t.text)}>{value}</p>
      {hint && <p className="mt-1.5 truncate text-xs text-ink-soft">{hint}</p>}
    </>
  )
  const cls = clsx(
    "flex h-full w-full flex-col justify-start rounded-[var(--radius-card)] border bg-surface p-3.5 text-left shadow-[var(--shadow-card)] transition-colors",
    active ? clsx(t.border, "ring-2 ring-inset ring-current", t.text) : "border-line",
    (href || onClick) && "hover:bg-surface-2",
  )
  if (href) return <Link href={href} className={cls}>{body}</Link>
  if (onClick) return <button onClick={onClick} aria-pressed={active} className={cls}>{body}</button>
  return <div className={cls}>{body}</div>
}

/** A tappable row in a list: leading mark, title, subtitle, something on the right. */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  right,
  chevron = !!href,
  className,
}: {
  href?: string
  onClick?: () => void
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  chevron?: boolean
  className?: string
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-snug">{title}</p>
        {subtitle && <p className="truncate text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
      {chevron && <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-faint" />}
    </>
  )
  const cls = clsx(
    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
    (href || onClick) && "hover:bg-surface-2 active:bg-surface-2",
    className,
  )
  if (href) return <Link href={href} className={cls}>{inner}</Link>
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

/** A card that holds rows, divided by hairlines. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)] divide-y divide-line", className)}>
      {children}
    </div>
  )
}

/** A round mark with initials or an icon, coloured by tone. */
export function Avatar({ name, tone = "brand", size = 40, icon: Icon }: { name?: string; tone?: Tone; size?: number; icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }) {
  const t = TONE[tone]
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", t.soft, t.text)}
    >
      {Icon ? <Icon size={size * 0.5} aria-hidden /> : initials || "•"}
    </span>
  )
}

/* ---------------------------------------------------------------- disclosure */

export function Disclosure({
  title,
  summary,
  defaultOpen,
  children,
  className,
}: {
  title: React.ReactNode
  summary?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <details open={defaultOpen} className={clsx("group rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      <summary className="flex min-h-[52px] items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {summary && <span className="block truncate text-sm text-ink-soft">{summary}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className="disclosure-chevron shrink-0 text-ink-faint transition-transform" />
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  )
}

/** Segmented control: one row of choices, the chosen one lifted. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (value: T) => void
  items: { value: T; label: React.ReactNode; count?: number; tone?: Tone }[]
  className?: string
}) {
  return (
    <div role="tablist" className={clsx("scroll-thin flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1", className)}>
      {items.map((item) => {
        const on = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.value)}
            className={clsx(
              "flex min-h-[38px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors",
              on ? "bg-raised text-ink shadow-[var(--shadow-card)]" : "text-ink-soft hover:text-ink",
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className={clsx("rounded-full px-1.5 text-[11px] tabular-nums", on ? clsx(TONE[item.tone ?? "brand"].soft, TONE[item.tone ?? "brand"].text) : "bg-line text-ink-soft")}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- overlays */

/** A bottom sheet on a phone, a centred dialog on a laptop. Forms that are not the screen's job live here. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  const { t } = useI18n()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={clsx(
            "anim-sheet fixed z-50 flex max-h-[92dvh] flex-col bg-surface text-ink shadow-[var(--shadow-pop)] outline-none",
            "inset-x-0 bottom-0 rounded-t-3xl",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            wide ? "sm:max-w-2xl" : "sm:max-w-md",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start gap-2 px-5 pb-2 pt-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-soft">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label={t("action.close")} className="-mr-2 -mt-1">
                <X size={20} aria-hidden />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="flex gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export type MenuItem = {
  label: React.ReactNode
  icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
  onSelect?: () => void
  href?: string
  danger?: boolean
  disabled?: boolean
  /** Renders a divider above this item. */
  separator?: boolean
}

/** The overflow: everything a screen can do that is not its main job. */
export function Menu({ items, label, trigger, align = "end" }: { items: MenuItem[]; label?: string; trigger?: React.ReactNode; align?: "start" | "end" }) {
  const { t } = useI18n()
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <IconButton label={label ?? t("common.more")} className="border border-line bg-surface">
            <MoreHorizontal size={20} aria-hidden />
          </IconButton>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="anim-pop z-50 min-w-[220px] rounded-xl border border-line bg-surface p-1.5 text-ink shadow-[var(--shadow-pop)] outline-none"
        >
          {items.map((item, i) => {
            const Icon = item.icon
            const cls = clsx(
              "flex min-h-[44px] w-full cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-[15px] outline-none",
              "data-[highlighted]:bg-surface-2 data-[disabled]:opacity-45",
              item.danger ? "text-danger" : "text-ink",
            )
            return (
              <div key={i}>
                {item.separator && <DropdownMenu.Separator className="my-1.5 h-px bg-line" />}
                {item.href ? (
                  <DropdownMenu.Item asChild disabled={item.disabled}>
                    <Link href={item.href} className={cls}>
                      {Icon && <Icon size={18} aria-hidden />} {item.label}
                    </Link>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item disabled={item.disabled} onSelect={item.onSelect} className={cls}>
                    {Icon && <Icon size={18} aria-hidden />} {item.label}
                  </DropdownMenu.Item>
                )}
              </div>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/* ---------------------------------------------------------------- forms */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </label>
  )
}

/** Choice chips: a row of options where a select would hide the answer. */
export function ChoiceChips<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T | T[]
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = Array.isArray(value) ? value.includes(o.value) : value === o.value
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              "min-h-[40px] rounded-full border px-3.5 text-sm font-semibold transition-colors",
              on ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-2",
              "disabled:opacity-45",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A number with − and + on either side, for adults, children and nights. */
export function Stepper({ label, value, min = 0, max = 99, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line-strong bg-surface px-3 py-1.5">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)} className="h-9 w-9 rounded-lg bg-surface-2 text-lg font-bold text-ink disabled:opacity-35">−</button>
        <span className="w-8 text-center text-lg font-bold tabular-nums">{value}</span>
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)} className="h-9 w-9 rounded-lg bg-brand-soft text-lg font-bold text-brand-ink disabled:opacity-35">+</button>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- status */

/** Status never relies on colour alone: every chip carries a word too (PRD accessibility). */
export function Chip({ tone = "neutral", children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  const t = TONE[tone]
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", t.soft, t.text, className)}>
      {dot && <span aria-hidden className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", t.solid)} />}
      {children}
    </span>
  )
}

export function Banner({ tone = "info", children, onClose }: { tone?: "info" | "ok" | "warn" | "danger"; children: React.ReactNode; onClose?: () => void }) {
  const Icon = { info: Info, ok: Check, warn: AlertTriangle, danger: XCircle }[tone]
  const t = TONE[tone]
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("anim-pop flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium", t.soft, t.text)}>
      <Icon size={18} aria-hidden className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="×" className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-black/5">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n()
  return (
    <div role="status" aria-label={t("common.loading")} className="space-y-3">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-line" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-[var(--radius-card)] bg-line" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}

export function Empty({ children, icon: Icon = Inbox, action }: { children?: React.ReactNode; icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>; action?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong px-4 py-8 text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
        <Icon size={22} aria-hidden />
      </span>
      <p className="text-sm text-ink-soft">{children ?? t("today.empty")}</p>
      {action}
    </div>
  )
}

/** Label on the left, value on the right. */
export function KV({ label, value, strong, tone }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: Tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={clsx("text-sm", strong ? "font-semibold text-ink" : "text-ink-soft")}>{label}</dt>
      <dd className={clsx("tabular-nums", strong ? "text-base font-bold" : "text-sm font-medium", tone && TONE[tone].text)}>{value}</dd>
    </div>
  )
}
