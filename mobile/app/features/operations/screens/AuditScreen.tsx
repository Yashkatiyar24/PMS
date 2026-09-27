import { useState } from "react"
import { View, type ViewStyle, type TextStyle } from "react-native"

import {
  ChoiceChips,
  DateField,
  Disclosure,
  Empty,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Text,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { addDays, formatDateTime, today } from "@/utils/date"

/** Every change: who, what, when, before and after. */
export function AuditScreen() {
  const navigation = useAppNavigation()
  const { theme } = useAppTheme()
  const [from, setFrom] = useState(addDays(today(), -7))
  const [to, setTo] = useState(today())
  const [table, setTable] = useState<string>("all")
  const [q, setQ] = useState("")
  const [submitted, setSubmitted] = useState("")
  const tables = useResource(() => api.operations.auditTables(), [], { cacheKey: "auditTables" })
  const entries = useResource(
    () => api.operations.audit(from, to, table === "all" ? null : table, submitted || null),
    [from, to, table, submitted],
  )

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader title={translate("audit.title")} onBack={() => navigation.goBack()} />
      <Panel>
        <View style={$dates}>
          <View style={$half}>
            <DateField label={translate("period.from")} value={from} max={to} onChange={setFrom} />
          </View>
          <View style={$half}>
            <DateField label={translate("period.to")} value={to} min={from} onChange={setTo} />
          </View>
        </View>
        <Text
          text={translate("audit.kind")}
          size="xs"
          weight="bold"
          style={{ color: theme.colors.text }}
        />
        <ChoiceChips
          value={table}
          onChange={setTable}
          options={[
            { value: "all", label: translate("common.all") },
            ...(tables.data ?? []).map((t) => ({
              value: t,
              label: translateOr(`audit.table.${t}`, t),
            })),
          ]}
        />
        <Input
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => setSubmitted(q.trim())}
          onBlur={() => setSubmitted(q.trim())}
          placeholder={translate("action.search")}
          returnKeyType="search"
        />
      </Panel>
      {entries.loading && <Loading />}
      {entries.problem && !entries.data && (
        <ErrorState message={entries.problem.message} onRetry={entries.reload} />
      )}
      {entries.data && entries.data.length === 0 && <Empty text={translate("empty.audit")} />}
      {entries.data?.map((e) => (
        <Disclosure
          key={e.id}
          title={`${translateOr(`activity.${e.table}.${e.action}`, e.action)} · ${translateOr(`audit.table.${e.table}`, e.table)}`}
          summary={`${formatDateTime(e.at)} · ${e.userName ? translate("res.by", { name: e.userName }) : translate("res.system")}`}
        >
          <Text text={e.rowId} size="xxs" style={[$mono, { color: theme.colors.textFaint }]} />
          {e.before && (
            <Text
              text={`${translate("audit.before")}\n${pretty(e.before)}`}
              size="xxs"
              style={[$mono, { color: theme.colors.textDim }]}
            />
          )}
          {e.after && (
            <Text
              text={`${translate("audit.after")}\n${pretty(e.after)}`}
              size="xxs"
              style={[$mono, { color: theme.colors.text }]}
            />
          )}
        </Disclosure>
      ))}
    </Screen>
  )
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $dates: ViewStyle = { flexDirection: "row", gap: 8 }
const $half: ViewStyle = { flex: 1 }
const $mono: TextStyle = { fontFamily: "monospace" }
