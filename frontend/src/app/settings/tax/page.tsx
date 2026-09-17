"use client"

/**
 * GST slabs (PRD P5). Rates are effective-dated rows, not code, so a change in the law is data entry: the
 * new rule is added with the date it applies from, and every charge is taxed by the rule in force on its own
 * date. Nothing already invoiced moves.
 */
import { useState } from "react"
import Link from "next/link"
import { api, ApiError } from "@/lib/api"
import { formatDate, rupees, toPaise } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Empty, Field, Loading } from "@/components/ui"

type Slab = { uptoPaise: number | null; bp: number }
type TaxRule = { id: string; effectiveFrom: string; rules: { slabs: Slab[]; note: string | null } }

export default function TaxSetupPage() {
  const { t } = useI18n()
  const { can } = useSession()
  const { data: rules, reload } = useResource(() => api<TaxRule[]>("/api/tax-rules"), [], t("error.generic"))
  const [effectiveFrom, setEffectiveFrom] = useState("")
  const [slabs, setSlabs] = useState<Slab[]>([{ uptoPaise: 750000, bp: 500 }, { uptoPaise: null, bp: 1800 }])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    setError("")
    try {
      await api("/api/tax-rules", { method: "POST", body: { effectiveFrom, rules: { slabs, note: null } } })
      setEffectiveFrom("")
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  if (!rules) return <Loading />

  const describe = (slab: Slab) =>
    slab.uptoPaise === null ? t("setup.above") : `${t("setup.slabUpto")} ${rupees(slab.uptoPaise)}`

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("setup.tax")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      {rules.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, index) => (
            <li key={rule.id}>
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{formatDate(rule.effectiveFrom)}</span>
                  {index === 0 && <Chip tone="ok">{t("action.done")}</Chip>}
                </div>
                <ul className="space-y-1 text-sm">
                  {rule.rules.slabs.map((slab, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-[var(--color-ink-soft)]">{describe(slab)}</span>
                      <span className="font-semibold tabular-nums">{slab.bp / 100}%</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {can("OWNER") && (
      <Card className="space-y-3">
        <h2 className="font-semibold">{t("action.add")}</h2>
        <Field label={t("setup.effectiveFrom")}>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>

        {slabs.map((slab, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <Field label={slab.uptoPaise === null ? t("setup.above") : t("setup.slabUpto")}>
              <input
                inputMode="decimal"
                disabled={slab.uptoPaise === null}
                value={slab.uptoPaise === null ? "—" : String(slab.uptoPaise / 100)}
                onChange={(e) =>
                  setSlabs(slabs.map((s, i) => (i === index ? { ...s, uptoPaise: toPaise(e.target.value) } : s)))
                }
              />
            </Field>
            <Field label={t("setup.slabRate")}>
              <input
                inputMode="decimal"
                value={String(slab.bp / 100)}
                onChange={(e) =>
                  setSlabs(slabs.map((s, i) => (i === index ? { ...s, bp: Math.round(Number(e.target.value) * 100) } : s)))
                }
              />
            </Field>
          </div>
        ))}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setSlabs([...slabs.slice(0, -1), { uptoPaise: 0, bp: 0 }, slabs[slabs.length - 1]])}
        >
          {t("setup.addSlab")}
        </Button>
        <Button className="w-full" disabled={busy || !effectiveFrom} onClick={add}>
          {t("action.save")}
        </Button>
      </Card>
      )}

      <Link href="/settings">
        <Button variant="ghost" className="w-full">
          {t("action.back")}
        </Button>
      </Link>
    </div>
  )
}
