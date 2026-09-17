"use client"

/**
 * GST slabs (PRD P5). Rates are effective-dated rows, not code, so a change in the law is data entry: the
 * new rule is added with the date it applies from, and every charge is taxed by the rule in force on its own
 * date. Nothing already invoiced moves.
 */
import { useState } from "react"
import { Percent, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDate, rupees, toPaise } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Chip, Disclosure, Empty, Field, KV, Loading, PageHeader, Sheet } from "@/components/ui"

type Slab = { uptoPaise: number | null; bp: number }
type TaxRule = { id: string; effectiveFrom: string; rules: { slabs: Slab[]; note: string | null } }

export default function TaxSetupPage() {
  const { t } = useI18n()
  const { can } = useSession()
  const { data: rules, reload } = useResource(() => api<TaxRule[]>("/api/tax-rules"), [], t("error.generic"))
  const [adding, setAdding] = useState(false)
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
      setAdding(false)
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  if (!rules) return <Loading />

  const describe = (slab: Slab) => (slab.uptoPaise === null ? t("setup.above") : `${t("setup.slabUpto")} ${rupees(slab.uptoPaise)}`)
  const summary = (rule: TaxRule) => rule.rules.slabs.map((s) => `${s.bp / 100}%`).join(" / ")

  return (
    <div className="space-y-4">
      <PageHeader title={t("setup.tax")} back="/settings" actions={can("OWNER") ? <Button size="sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> {t("action.add")}</Button> : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {rules.length === 0 ? (
        <Empty icon={Percent} />
      ) : (
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <Disclosure
              key={rule.id}
              defaultOpen={index === 0}
              title={<span className="flex items-center gap-2">{formatDate(rule.effectiveFrom)} {index === 0 && <Chip tone="ok" dot>{t("action.done")}</Chip>}</span>}
              summary={summary(rule)}
            >
              <dl>
                {rule.rules.slabs.map((slab, i) => (
                  <KV key={i} label={describe(slab)} value={`${slab.bp / 100}%`} />
                ))}
              </dl>
            </Disclosure>
          ))}
        </div>
      )}

      <Sheet open={adding} onOpenChange={setAdding} title={t("action.add")} description={t("setup.tax")}
        footer={<Button size="lg" className="w-full" disabled={busy || !effectiveFrom} onClick={add}>{t("action.save")}</Button>}>
        <div className="space-y-3">
          <Field label={t("setup.effectiveFrom")}>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} autoFocus />
          </Field>
          {slabs.map((slab, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <Field label={slab.uptoPaise === null ? t("setup.above") : t("setup.slabUpto")}>
                <input inputMode="decimal" disabled={slab.uptoPaise === null} value={slab.uptoPaise === null ? "—" : String(slab.uptoPaise / 100)}
                  onChange={(e) => setSlabs(slabs.map((s, i) => (i === index ? { ...s, uptoPaise: toPaise(e.target.value) } : s)))} />
              </Field>
              <Field label={t("setup.slabRate")}>
                <input inputMode="decimal" value={String(slab.bp / 100)}
                  onChange={(e) => setSlabs(slabs.map((s, i) => (i === index ? { ...s, bp: Math.round(Number(e.target.value) * 100) } : s)))} />
              </Field>
            </div>
          ))}
          <Button variant="soft" size="sm" onClick={() => setSlabs([...slabs.slice(0, -1), { uptoPaise: 0, bp: 0 }, slabs[slabs.length - 1]])}>
            <Plus size={14} aria-hidden /> {t("setup.addSlab")}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
