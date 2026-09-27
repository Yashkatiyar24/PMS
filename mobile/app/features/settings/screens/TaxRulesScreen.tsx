import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Button,
  Chip,
  Disclosure,
  Empty,
  ErrorState,
  Input,
  KV,
  Loading,
  MoneyInput,
  PageHeader,
  Panel,
  Screen,
  Sheet,
  DateField,
  showError,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDate, today } from "@/utils/date"
import { rupees, toPaise } from "@/utils/format"

import type { TaxRule, TaxSlab } from "../types"

const slabLabel = (s: TaxSlab) =>
  s.uptoPaise === null
    ? translate("setup.above")
    : `${translate("setup.slabUpto")} ${rupees(s.uptoPaise)}`

/** GST slabs by effective date; the owner adds a new table when rates change. */
export function TaxRulesScreen() {
  const navigation = useAppNavigation()
  const { can } = usePermission()
  const rules = useResource(() => api.settings.taxRules(), [], { cacheKey: "taxRules" })
  const [adding, setAdding] = useState(false)
  const list = [...(rules.data ?? [])].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  )
  const inForce = list.find((r) => r.effectiveFrom <= today())

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("setup.tax")}
        onBack={() => navigation.goBack()}
        actions={
          can("OWNER") ? (
            <Button size="sm" text={translate("action.add")} onPress={() => setAdding(true)} />
          ) : undefined
        }
      />
      {inForce && (
        <Panel>
          <KV
            label={translate("setup.effectiveFrom")}
            value={formatDate(inForce.effectiveFrom)}
            strong
          />
          {inForce.rules.slabs.map((s, i) => (
            <KV key={i} label={slabLabel(s)} value={`${s.bp / 100}%`} />
          ))}
        </Panel>
      )}
      {rules.loading && <Loading />}
      {rules.problem && !rules.data && (
        <ErrorState message={rules.problem.message} onRetry={rules.reload} />
      )}
      {rules.data && list.length === 0 && <Empty text={translate("empty.tax")} />}
      {list.map((r: TaxRule, i) => (
        <Disclosure
          key={r.id}
          title={formatDate(r.effectiveFrom)}
          summary={r.rules.slabs.map((s) => `${s.bp / 100}%`).join(" / ")}
          defaultOpen={i === 0}
        >
          {r === inForce && <Chip tone="ok" text={translate("action.done")} />}
          {r.rules.slabs.map((s, j) => (
            <KV key={j} label={slabLabel(s)} value={`${s.bp / 100}%`} />
          ))}
        </Disclosure>
      ))}
      {adding && (
        <AddRuleSheet
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void rules.reload()
          }}
        />
      )}
    </Screen>
  )
}

function AddRuleSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [effectiveFrom, setEffectiveFrom] = useState(today())
  const [slabs, setSlabs] = useState<{ upto: string; pct: string }[]>([
    { upto: "7500", pct: "5" },
    { upto: "", pct: "18" },
  ])
  const set = (i: number, patch: Partial<{ upto: string; pct: string }>) =>
    setSlabs((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const submit = async () => {
    const body: TaxSlab[] = slabs.map((s, i) => ({
      uptoPaise: i === slabs.length - 1 ? null : toPaise(s.upto),
      bp: Math.round(parseFloat(s.pct || "0") * 100),
    }))
    const r = await api.settings.addTaxRule(effectiveFrom, { slabs: body, note: null })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("setup.tax")}
      footer={<Button size="lg" text={translate("action.save")} onPress={submit} />}
    >
      <DateField
        label={translate("setup.effectiveFrom")}
        value={effectiveFrom}
        onChange={setEffectiveFrom}
      />
      {slabs.map((s, i) => (
        <View key={i} style={$slab}>
          <View style={$grow}>
            {i === slabs.length - 1 ? (
              <Input label={translate("setup.above")} value="" editable={false} />
            ) : (
              <MoneyInput
                label={translate("setup.slabUpto")}
                value={s.upto}
                onChangeText={(upto) => set(i, { upto })}
              />
            )}
          </View>
          <View style={$pct}>
            <Input
              label={translate("setup.slabRate")}
              value={s.pct}
              onChangeText={(pct) => set(i, { pct: pct.replace(/[^\d.]/g, "") })}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      ))}
      <Button
        preset="secondary"
        size="sm"
        text={translate("setup.addSlab")}
        onPress={() =>
          setSlabs((ss) => [...ss.slice(0, -1), { upto: "", pct: "12" }, ss[ss.length - 1]])
        }
      />
    </Sheet>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $slab: ViewStyle = { flexDirection: "row", gap: 8 }
const $grow: ViewStyle = { flex: 1 }
const $pct: ViewStyle = { width: 100 }
