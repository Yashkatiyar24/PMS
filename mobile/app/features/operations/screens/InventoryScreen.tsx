import { useState } from "react"
import { View, type ViewStyle } from "react-native"

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
  SectionLabel,
  Segmented,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"

import { MovementSheet, StockItemSheet } from "../components/StockSheets"
import { STOCK_CATEGORIES, type StockItem } from "../types"

/** Things kept in stock, by category; tap an item to record a movement or edit it. */
export function InventoryScreen() {
  const navigation = useAppNavigation()
  const [view, setView] = useState<"all" | "low">("all")
  const [editing, setEditing] = useState<StockItem | "new" | null>(null)
  const [moving, setMoving] = useState<StockItem | null>(null)
  const items = useResource(() => api.operations.stockItems(), [], { cacheKey: "stock" })
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms" })
  const list = (items.data ?? []).filter((i) => view === "all" || i.low)
  const lowCount = (items.data ?? []).filter((i) => i.low).length

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("stock.title")}
        subtitle={translate("stock.lowCount", { n: lowCount })}
        onBack={() => navigation.goBack()}
        actions={
          <Button size="sm" text={translate("action.add")} onPress={() => setEditing("new")} />
        }
      />
      <Panel>
        <KV label={translate("common.all")} value={String(items.data?.length ?? 0)} />
        <KV
          label={translate("stock.low")}
          value={String(lowCount)}
          tone={lowCount > 0 ? "warn" : undefined}
        />
      </Panel>
      <Segmented<"all" | "low">
        value={view}
        onChange={setView}
        items={[
          { value: "all", label: translate("common.all") },
          { value: "low", label: translate("stock.low"), count: lowCount },
        ]}
      />
      {!!items.loading && <Loading />}
      {!!items.problem && !items.data && (
        <ErrorState message={items.problem.message} onRetry={items.reload} />
      )}
      {!!items.data && list.length === 0 && <Empty text={translate("empty.inventory")} />}
      {STOCK_CATEGORIES.map((cat) => {
        const rows = list.filter((i) => i.category === cat)
        if (rows.length === 0) return null
        return (
          <View key={cat}>
            <SectionLabel text={translateOr(`stock.cat.${cat}`, cat)} />
            <ListCard>
              {rows.map((it, i) => (
                <ListRow
                  key={it.id}
                  leading={<Avatar glyph={it.low ? "⚠" : "📦"} tone={it.low ? "warn" : "teal"} />}
                  title={it.name}
                  subtitle={
                    it.category === "linen"
                      ? translate("stock.atLaundry", { n: it.atLaundry })
                      : translate("stock.lowLine", { n: it.lowStockThreshold })
                  }
                  right={
                    <Chip tone={it.low ? "warn" : "neutral"} text={`${it.onHand} ${it.unit}`} />
                  }
                  struck={!it.active}
                  onPress={() => setMoving(it)}
                  last={i === rows.length - 1}
                />
              ))}
            </ListCard>
          </View>
        )
      })}
      {!!editing && (
        <StockItemSheet
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            void items.reload()
          }}
        />
      )}
      {!!moving && (
        <MovementSheet
          item={moving}
          rooms={(rooms.data ?? []).map((r) => ({ id: r.id, number: r.number }))}
          onClose={() => setMoving(null)}
          onEdit={() => {
            setEditing(moving)
            setMoving(null)
          }}
          onDone={() => {
            setMoving(null)
            void items.reload()
          }}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
