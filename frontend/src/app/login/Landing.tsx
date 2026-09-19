"use client"

/**
 * What a visitor who has not signed in reads below the sign-in card: what the product does, how a check-in
 * goes, and what it costs. Every claim here is something the app does today. There are no testimonials:
 * we will not show reviews nobody wrote.
 */
import { BookOpen, Languages, MessageCircle, QrCode, ReceiptText, Users, WalletCards, WifiOff } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { rupees } from "@/lib/format"

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>

// Mirrors the plans seed (V3__seed_plans.sql); there is no public endpoint to read it from.
const PLANS = [
  { name: "landing.plan.basic", rooms: 20, monthly: 49900, annual: 500000 },
  { name: "landing.plan.standard", rooms: 60, monthly: 99900, annual: 1000000 },
  { name: "landing.plan.large", rooms: 61, more: true, monthly: 149900, annual: 1500000 },
] as const

// Scenes from the same sky as the hero. The warm and night tiles keep their own ink in both themes.
const TILES: { key: "arrive" | "register" | "receipt" | "report"; icon: Icon; bg: string; ink: string }[] = [
  { key: "arrive", icon: Users, bg: "linear-gradient(160deg, var(--glow-hi), var(--glow))", ink: "text-[#3b2410]" },
  { key: "register", icon: BookOpen, bg: "linear-gradient(160deg, var(--stone), var(--trim))", ink: "text-ink" },
  { key: "receipt", icon: ReceiptText, bg: "linear-gradient(160deg, var(--sky), var(--glass))", ink: "text-ink" },
  { key: "report", icon: MessageCircle, bg: "linear-gradient(160deg, #34496b, #060d1a)", ink: "text-white" },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display reveal mx-auto max-w-3xl text-balance text-center text-4xl md:text-6xl">{children}</h2>
}

export function Landing() {
  const { t } = useI18n()
  return (
    <div className="bg-surface">
      {/* Why */}
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center md:pb-24 md:pt-28">
        <p className="reveal text-balance text-2xl font-semibold leading-snug tracking-tight md:text-4xl">
          {t("landing.why.lead")} <span className="text-ink-soft">{t("landing.why.rest")}</span>
        </p>
      </section>

      {/* A row of scenes: swipe on a phone, four across on a laptop */}
      <section className="mx-auto max-w-6xl">
        <ul className="reveal scroll-thin flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-8">
          {TILES.map(({ key, icon: Icon, bg, ink }) => (
            <li key={key} style={{ background: bg }} className={clsx("flex aspect-[3/4] w-[68%] shrink-0 snap-start flex-col justify-between rounded-3xl p-5 transition-transform duration-500 hover:-translate-y-1.5 md:w-auto", ink)}>
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/25">
                <Icon size={32} strokeWidth={1.6} aria-hidden />
              </span>
              <span className="text-xl font-bold leading-tight tracking-tight">{t(`landing.tile.${key}`)}</span>
            </li>
          ))}
        </ul>
        <p className="reveal mx-auto mt-8 max-w-2xl text-balance px-4 text-center text-lg text-ink-soft">{t("landing.tiles.caption")}</p>
      </section>

      {/* How a check-in goes */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-28">
        <SectionTitle>{t("landing.how.title")}</SectionTitle>
        <ol className="mt-12 grid gap-4 md:grid-cols-3 md:gap-6">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className="reveal rounded-3xl bg-bg p-6">
              <span className="text-5xl font-extrabold tabular-nums tracking-tight text-ink-faint">0{n}</span>
              <h3 className="mt-6 text-xl font-bold tracking-tight">{t(`landing.how.${n}.title`)}</h3>
              <p className="mt-2 text-ink-soft">{t(`landing.how.${n}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* For the owner: a picture on one side, the words on the other */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2 md:gap-16 md:px-8">
        <div className="sky reveal grid place-items-center rounded-3xl px-6 py-12">
          <ReportCard />
        </div>
        <div>
          <h2 className="display reveal text-balance text-4xl md:text-5xl">{t("landing.owner.title")}</h2>
          <p className="mt-5 text-lg text-ink-soft">{t("landing.owner.body")}</p>
          <a href="#signin" className="mt-8 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-ink px-6 font-semibold text-bg transition-colors hover:bg-ink/85">
            {t("landing.owner.cta")} <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      {/* What it replaces */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-28">
        <SectionTitle>{t("landing.features.title")}</SectionTitle>
        <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-6">
          <Feature icon={BookOpen} scene="linear-gradient(160deg, var(--stone), var(--trim))" title={t("landing.f.register.title")} body={t("landing.f.register.body")} />
          <Feature icon={ReceiptText} scene="linear-gradient(160deg, var(--sky), var(--glass))" title={t("landing.f.receipts.title")} body={t("landing.f.receipts.body")} />
          <Feature icon={WalletCards} scene="linear-gradient(160deg, var(--glow-hi), var(--glow))" title={t("landing.f.accounts.title")} body={t("landing.f.accounts.body")} warm />
        </div>
      </section>

      {/* The desk as it really is */}
      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
        <SectionTitle>{t("landing.extra.title")}</SectionTitle>
        <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-6">
          {([
            ["offline", WifiOff],
            ["hindi", Languages],
            ["qr", QrCode],
          ] as const).map(([key, Icon]) => (
            <div key={key} className="reveal rounded-3xl border border-line p-6">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-bg"><Icon size={22} aria-hidden /></span>
              <h3 className="mt-6 text-xl font-bold tracking-tight">{t(`landing.x.${key}.title`)}</h3>
              <p className="mt-2 text-ink-soft">{t(`landing.x.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 bg-bg px-4 py-20 md:px-8 md:py-28">
        <SectionTitle>{t("landing.pricing.title")}</SectionTitle>
        <p className="mt-4 text-center text-lg text-ink-soft">{t("landing.pricing.sub")}</p>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3 md:gap-6">
          {PLANS.map((plan, i) => (
            <div key={plan.name} className={clsx("reveal rounded-3xl p-7", i === 1 ? "bg-ink text-bg" : "bg-surface shadow-[var(--shadow-card)]")}>
              <h3 className="text-lg font-bold">{t(plan.name)}</h3>
              <p className={clsx("text-sm", i === 1 ? "opacity-70" : "text-ink-soft")}>
                {"more" in plan ? t("landing.plan.roomsMore", { n: plan.rooms }) : t("landing.plan.rooms", { n: plan.rooms })}
              </p>
              <p className="mt-8">
                <span className="text-5xl font-extrabold tracking-tight tabular-nums">{rupees(plan.monthly)}</span>
                <span className={clsx("ml-1", i === 1 ? "opacity-70" : "text-ink-soft")}>{t("landing.plan.month")}</span>
              </p>
              <p className={clsx("mt-2 text-sm", i === 1 ? "opacity-70" : "text-ink-soft")}>{t("landing.plan.year", { amount: rupees(plan.annual) })}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-ink px-4 py-14 text-bg md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-sm">
            <p className="text-2xl font-extrabold tracking-tight">{t("app.name")}</p>
            <p className="mt-2 opacity-70">{t("landing.footer.line")}</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-1 font-semibold">
            <a href="#features" className="inline-flex min-h-[44px] items-center hover:opacity-70">{t("landing.nav.features")}</a>
            <a href="#how" className="inline-flex min-h-[44px] items-center hover:opacity-70">{t("landing.nav.how")}</a>
            <a href="#pricing" className="inline-flex min-h-[44px] items-center hover:opacity-70">{t("landing.nav.pricing")}</a>
            <a href="#signin" className="inline-flex min-h-[44px] items-center hover:opacity-70">{t("login.title")}</a>
          </nav>
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-bg/15 pt-6 text-sm opacity-60">© {new Date().getFullYear()} {t("app.name")}</p>
      </footer>
    </div>
  )
}

function Feature({ icon: Icon, scene, title, body, warm }: { icon: Icon; scene: string; title: string; body: string; warm?: boolean }) {
  return (
    <div className="reveal rounded-3xl bg-bg p-3">
      <div style={{ background: scene }} className={clsx("grid h-44 place-items-center rounded-2xl", warm ? "text-[#3b2410]" : "text-ink")}>
        <Icon size={48} strokeWidth={1.4} aria-hidden />
      </div>
      <div className="px-3 pb-3 pt-5">
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-ink-soft">{body}</p>
      </div>
    </div>
  )
}

/** The evening summary as the owner sees it, with made-up figures that say so. */
function ReportCard() {
  const { t } = useI18n()
  const rows: [string, string][] = [
    [t("reports.occupancy"), "72%"],
    [t("reports.arrivals"), "14"],
    [t("reports.outstanding"), rupees(230000)],
  ]
  return (
    <div className="w-full max-w-xs rounded-3xl bg-surface p-5 shadow-[var(--shadow-pop)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-soft">{t("reports.daily")}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{t("landing.owner.sample")}</span>
      </div>
      <p className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">{rupees(1845000)}</p>
      <dl className="mt-4 divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-2 text-sm">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
