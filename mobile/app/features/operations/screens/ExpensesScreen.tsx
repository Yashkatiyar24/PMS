import { useState } from "react"
import { Linking, View, type ViewStyle, type TextStyle } from "react-native"

import {
  Avatar,
  Button,
  Chip,
  Empty,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Text,
  showError,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { addMonths, formatDate, formatMonth, monthRange, today } from "@/utils/date"
import { rupees } from "@/utils/format"

import { ExpenseSheet, VoidExpenseSheet } from "../components/ExpenseSheets"
import type { Expense } from "../types"

/** Money spent on the property, by month; add with a bill photo, void with a reason. */
export function ExpensesScreen() {
  const navigation = useAppNavigation()
  const { theme } = useAppTheme()
  const [month, setMonth] = useState(monthRange(today()).from)
  const range = monthRange(month)
  const summary = useResource(() => api.operations.expenses(range.from, range.to), [range.from], {
    cacheKey: `expenses.${range.from}`,
  })
  const [adding, setAdding] = useState(false)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const s = summary.data

  const openBill = async (e: Expense) => {
    const r = await api.operations.expenseReceiptUrl(e.id)
    if (!r.ok) return showError(r.problem)
    void Linking.openURL(r.data.url)
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("expense.title")}
        onBack={() => navigation.goBack()}
        actions={
          <Button size="sm" text={translate("action.add")} onPress={() => setAdding(true)} />
        }
      />
      <Panel>
        <View style={$pager}>
          <Button
            preset="ghost"
            size="sm"
            text="‹"
            onPress={() => setMonth(addMonths(month, -1))}
            accessibilityLabel={translate("cal.earlier")}
          />
          <Text text={formatMonth(month)} weight="bold" style={{ color: theme.colors.text }} />
          <Button
            preset="ghost"
            size="sm"
            text="›"
            onPress={() => setMonth(addMonths(month, 1))}
            accessibilityLabel={translate("cal.later")}
          />
        </View>
        <Text text={rupees(s?.totalPaise ?? 0)} style={[$big, { color: theme.colors.text }]} />
        {!!s &&
          Object.entries(s.byCategory)
            .filter(([, v]) => v > 0)
            .map(([c, v]) => (
              <KV key={c} label={translateOr(`expense.${c}`, c)} value={rupees(v)} />
            ))}
      </Panel>
      {!!summary.loading && <Loading />}
      {!!summary.problem && !s && (
        <ErrorState message={summary.problem.message} onRetry={summary.reload} />
      )}
      {!!s && s.expenses.length === 0 && <Empty text={translate("empty.expenses")} />}
      {!!s && s.expenses.length > 0 && (
        <ListCard>
          {s.expenses.map((e, i) => (
            <ListRow
              key={e.id}
              leading={<Avatar glyph="₹" tone={e.voidedAt ? "neutral" : "warn"} />}
              title={e.vendor || e.description || translateOr(`expense.${e.category}`, e.category)}
              subtitle={`${formatDate(e.spentOn)} · ${translateOr(`expense.${e.category}`, e.category)} · ${e.paymentMode.toUpperCase()}${e.voidReason ? ` · ${e.voidReason}` : ""}`}
              right={
                <View style={$right}>
                  {!!e.hasReceipt && (
                    <Button
                      preset="ghost"
                      size="sm"
                      text={translate("expense.bill")}
                      onPress={() => void openBill(e)}
                    />
                  )}
                  <Chip tone={e.voidedAt ? "neutral" : "brand"} text={rupees(e.amountPaise)} />
                </View>
              }
              struck={!!e.voidedAt}
              onPress={e.voidedAt ? undefined : () => setVoiding(e)}
              chevron={false}
              last={i === s.expenses.length - 1}
            />
          ))}
        </ListCard>
      )}
      {!!adding && (
        <ExpenseSheet
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void summary.reload()
          }}
        />
      )}
      {!!voiding && (
        <VoidExpenseSheet
          expense={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null)
            void summary.reload()
          }}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $pager: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
}
const $big: TextStyle = { fontSize: 30, fontWeight: "800" }
const $right: ViewStyle = { alignItems: "flex-end", gap: 4 }
