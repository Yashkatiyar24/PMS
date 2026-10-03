import { useState } from "react"
import { RefreshControl, type ViewStyle } from "react-native"

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
  Segmented,
  Switch,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatTime } from "@/utils/date"
import { rupees } from "@/utils/format"

import { OrderSheet } from "../components/OrderSheet"
import { DishSheet, SettleSheet } from "../components/RestaurantSheets"
import type { MenuItem, Order } from "../types"

/** Orders for tables and rooms, and the menu. */
export function RestaurantScreen() {
  const navigation = useAppNavigation()
  const { has, can } = usePermission()
  const [tab, setTab] = useState<"orders" | "menu">("orders")
  const [all, setAll] = useState(false)
  const [editingOrder, setEditingOrder] = useState<Order | "new" | null>(null)
  const [settling, setSettling] = useState<Order | null>(null)
  const [dish, setDish] = useState<MenuItem | "new" | null>(null)
  const orders = useResource(() => api.operations.orders(all), [all], {
    cacheKey: `orders.${all}`,
    refreshMs: 30_000,
  })
  const menu = useResource(() => api.operations.menu(), [], { cacheKey: "menu" })
  const today = useResource(() => api.bookings.today(), [], {
    cacheKey: "today",
    enabled: has("reservations.view"),
  })
  const list = orders.data ?? []
  const openCount = list.filter((o) => o.status === "open").length
  const inHouse = today.data?.inHouse ?? []
  const openBill = (o: Order) =>
    navigation.navigate("ReceiptViewer", {
      path: api.operations.billPath(o.id),
      title: o.billNumber ?? translate("pos.title"),
    })

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: <RefreshControl refreshing={orders.refreshing} onRefresh={orders.reload} />,
      }}
    >
      <PageHeader
        title={translate("pos.title")}
        onBack={() => navigation.goBack()}
        actions={
          tab === "orders" ? (
            <Button
              size="sm"
              text={translate("pos.newOrder")}
              onPress={() => setEditingOrder("new")}
            />
          ) : can("MANAGER") ? (
            <Button size="sm" text={translate("pos.addDish")} onPress={() => setDish("new")} />
          ) : undefined
        }
      />
      <Panel>
        <KV label={translate("pos.orders")} value={String(openCount)} />
        <KV
          label={translate("pos.menu")}
          value={String((menu.data ?? []).filter((m) => m.active).length)}
        />
      </Panel>
      <Segmented<"orders" | "menu">
        value={tab}
        onChange={setTab}
        items={[
          { value: "orders", label: translate("pos.orders"), count: openCount },
          { value: "menu", label: translate("pos.menu") },
        ]}
      />
      {tab === "orders" && (
        <>
          <Switch
            value={all}
            onValueChange={setAll}
            label={translate("pos.showSettled")}
            labelPosition="right"
          />
          {!!orders.loading && <Loading />}
          {!!orders.problem && !orders.data && (
            <ErrorState message={orders.problem.message} onRetry={orders.reload} />
          )}
          {!!orders.data && list.length === 0 && <Empty text={translate("empty.orders")} />}
          {list.length > 0 && (
            <ListCard>
              {list.map((o, i) => (
                <ListRow
                  key={o.id}
                  leading={
                    <Avatar
                      icon={o.bookingId ? "bed" : "receipt"}
                      tone={o.status === "open" ? "ok" : "neutral"}
                    />
                  }
                  title={
                    o.bookingId
                      ? `${o.units ?? ""} · ${o.guestName ?? ""}`
                      : o.tableLabel || translate("pos.counter")
                  }
                  subtitle={`${formatTime(o.createdAt)} · ${o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`}
                  right={
                    o.status === "open" ? (
                      <Chip tone="brand" text={rupees(o.totalPaise)} />
                    ) : (
                      <Button
                        preset="ghost"
                        size="sm"
                        text={translateOr(`pos.status.${o.status}`, o.status)}
                        onPress={() => openBill(o)}
                      />
                    )
                  }
                  onPress={o.status === "open" ? () => setSettling(o) : undefined}
                  chevron={o.status === "open"}
                  last={i === list.length - 1}
                />
              ))}
            </ListCard>
          )}
        </>
      )}
      {tab === "menu" && (
        <>
          {!!menu.data && menu.data.length === 0 && <Empty text={translate("empty.menu")} />}
          {!!menu.data && menu.data.length > 0 && (
            <ListCard>
              {menu.data.map((m, i) => (
                <ListRow
                  key={m.id}
                  title={m.name}
                  subtitle={m.category}
                  right={<Chip tone="neutral" text={rupees(m.pricePaise)} />}
                  struck={!m.active}
                  onPress={can("MANAGER") ? () => setDish(m) : undefined}
                  last={i === menu.data!.length - 1}
                />
              ))}
            </ListCard>
          )}
        </>
      )}
      {!!editingOrder && (
        <OrderSheet
          order={editingOrder === "new" ? null : editingOrder}
          menu={menu.data ?? []}
          inHouse={inHouse}
          onClose={() => setEditingOrder(null)}
          onDone={() => {
            setEditingOrder(null)
            void orders.reload()
          }}
        />
      )}
      {!!settling && (
        <SettleSheet
          order={settling}
          inHouse={inHouse}
          onClose={() => setSettling(null)}
          onEdit={() => {
            setEditingOrder(settling)
            setSettling(null)
          }}
          onDone={(paid) => {
            setSettling(null)
            void orders.reload()
            if (paid) openBill(paid)
          }}
        />
      )}
      {!!dish && (
        <DishSheet
          dish={dish === "new" ? null : dish}
          onClose={() => setDish(null)}
          onDone={() => {
            setDish(null)
            void menu.reload()
          }}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
