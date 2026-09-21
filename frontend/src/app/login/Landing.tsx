"use client"

/**
 * What a visitor who has not signed in reads below the hero: what the product replaces, how a check-in goes,
 * what it does, what the owner gets, and what it costs. Every claim here is something the app does today.
 * There are no testimonials: we will not show reviews nobody wrote.
 *
 * The layout is editorial rather than card-based: a small label on the left, the words on the right, rows
 * divided by hairlines, one dark band with a single large word per feature, and a footer that ends on the name.
 */
import { ArrowRight } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { rupees } from "@/lib/format"
import { Wordmark } from "@/components/ui"

// Mirrors the plans seed (V3__seed_plans.sql); there is no public endpoint to read it from.
const PLANS = [
  { name: "landing.plan.basic", rooms: 20, monthly: 49900, annual: 500000 },
  { name: "landing.plan.standard", rooms: 60, monthly: 99900, annual: 1000000 },
  { name: "landing.plan.large", rooms: 61, more: true, monthly: 149900, annual: 1500000 },
] as const

/** One word each, and the sentence that earns it. */
const FEATURES = [
  { word: "landing.big.register", body: "landing.f.register.body" },
  { word: "landing.big.receipts", body: "landing.f.receipts.body" },
  { word: "landing.big.accounts", body: "landing.f.accounts.body" },
  { word: "landing.big.offline", body: "landing.x.offline.body" },
  { word: "landing.big.qr", body: "landing.x.qr.body" },
  { word: "landing.big.hindi", body: "landing.x.hindi.body" },
] as const

/** The split every section shares: a narrow left column for the label, a wide right one for the words. */
function Split({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:px-8", className)}>
      <div className="reveal min-w-0">{label}</div>
      <div className="reveal min-w-0">{children}</div>
    </div>
  )
}

const CTA = "inline-flex min-h-[52px] items-center gap-2 rounded-full bg-ink px-6 font-semibold text-bg transition-colors hover:bg-ink/85"

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useI18n()
  return (
    <div className="bg-surface">
      {/* 1 · What it replaces, and how a check-in goes */}
      <section id="how" className="scroll-mt-24 py-20 md:py-32">
        <Split
          label={
            <>
              <h2 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-6xl">
                {t("landing.h1.a")}<br /><span className="text-ink-faint">{t("landing.h1.b")}</span>
              </h2>
              <p className="mt-6 max-w-md text-lg text-ink-soft">{t("landing.why.lead")} {t("landing.why.rest")}</p>
              <button type="button" onClick={onSignIn} className={clsx(CTA, "mt-8")}>
                {t("landing.owner.cta")} <ArrowRight size={18} aria-hidden />
              </button>
            </>
          }
        >
          <p className="text-lg font-semibold">{t("landing.how.title")}</p>
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 py-7 md:py-9">
                <span className="text-sm tabular-nums text-ink-faint">0{n}</span>
                <p className="text-balance text-2xl leading-snug tracking-tight md:text-[2rem]">
                  <span className="font-semibold">{t(`landing.how.${n}.title`)}.</span> <span className="text-ink-faint">{t(`landing.how.${n}.body`)}</span>
                </p>
              </li>
            ))}
          </ol>
        </Split>
      </section>

      {/* 2 · What it does: one large word per feature, on dark. Pinned dark in both themes, like the reference. */}
      <section id="features" className="scroll-mt-24 bg-[#0f1115] text-[#f5f6f8]">
        <div className="border-b border-white/10 py-16 md:py-24">
          <Split label={<p className="font-semibold">{t("landing.features.label")}</p>}>
            <h2 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-6xl">
              {t("landing.features.a")}<br /><span className="text-white/45">{t("landing.features.b")}</span>
            </h2>
          </Split>
        </div>
        <ol>
          {FEATURES.map(({ word, body }, i) => (
            <li key={word} className="border-b border-white/10">
              <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-12 md:px-8 md:py-20">
                <div className="reveal grid grid-cols-[3rem_minmax(0,1fr)] gap-3 md:gap-5">
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-white/40 text-xs tabular-nums">{i + 1}</span>
                  <p className="max-w-sm text-lg leading-relaxed text-white/85">{t(body)}</p>
                </div>
                <p className="reveal min-w-0 truncate text-[clamp(3.5rem,13vw,7.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">{t(word)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 3 · For the owner */}
      <section className="py-20 md:py-32">
        <Split label={<p className="font-semibold">{t("landing.owner.label")}</p>}>
          <h2 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-6xl">{t("landing.owner.title")}</h2>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">{t("landing.owner.body")}</p>
          <button type="button" onClick={onSignIn} className={clsx(CTA, "mt-8")}>
            {t("landing.owner.cta")} <ArrowRight size={18} aria-hidden />
          </button>
        </Split>
      </section>

      {/* 4 · Pricing, as three rows rather than three cards */}
      <section id="pricing" className="scroll-mt-24 border-t border-line bg-bg py-20 md:py-32">
        <Split
          label={
            <>
              <p className="font-semibold">{t("landing.nav.pricing")}</p>
              <p className="mt-3 max-w-xs text-ink-soft">{t("landing.pricing.sub")}</p>
            </>
          }
        >
          <h2 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-6xl">{t("landing.pricing.title")}</h2>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {PLANS.map((plan) => (
              <li key={plan.name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-6">
                <div>
                  <p className="text-2xl font-semibold tracking-tight">{t(plan.name)}</p>
                  <p className="text-ink-soft">{"more" in plan ? t("landing.plan.roomsMore", { n: plan.rooms }) : t("landing.plan.rooms", { n: plan.rooms })}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">{rupees(plan.monthly)}<span className="text-base font-normal text-ink-soft">{t("landing.plan.month")}</span></p>
                  <p className="text-sm text-ink-soft">{t("landing.plan.year", { amount: rupees(plan.annual) })}</p>
                </div>
              </li>
            ))}
          </ul>
        </Split>
      </section>

      {/* Footer: the links, then the name as large as the page allows */}
      <footer className="bg-[#0f1115] px-4 pb-8 pt-20 text-[#f5f6f8] md:px-8 md:pt-28">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)_minmax(0,2fr)]">
          <div className="max-w-md">
            <Wordmark label={t("app.name")} className="h-6" />
            <p className="mt-3 text-white/60">{t("landing.footer.line")}</p>
          </div>
          <nav aria-label={t("landing.footer.explore")} className="flex flex-col items-start gap-1 text-2xl font-medium tracking-tight">
            <a href="#how" className="inline-flex min-h-[44px] items-center hover:text-white/70">{t("landing.nav.how")}</a>
            <a href="#features" className="inline-flex min-h-[44px] items-center hover:text-white/70">{t("landing.nav.features")}</a>
            <a href="#pricing" className="inline-flex min-h-[44px] items-center hover:text-white/70">{t("landing.nav.pricing")}</a>
          </nav>
          <div className="flex flex-col items-start gap-1 font-medium">
            <button type="button" onClick={onSignIn} className="inline-flex min-h-[44px] items-center hover:text-white/70">{t("login.signIn")}</button>
          </div>
        </div>
        <Wordmark decorative className="mx-auto mt-16 block w-full max-w-6xl md:mt-24" />
        <p className="mx-auto mt-6 max-w-6xl border-t border-white/10 pt-6 text-sm text-white/50">© {new Date().getFullYear()} {t("app.name")}</p>
      </footer>
    </div>
  )
}
