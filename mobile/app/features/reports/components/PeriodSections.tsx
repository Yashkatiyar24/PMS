import { View, type ViewStyle } from "react-native"

import { Button, Chip, Disclosure, HBars, KV, ListCard, ListRow } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { rupees } from "@/utils/format"

import type { OnlinePayments, PeriodReport } from "../types"

/** Revenue, bookings, sources, payments (+ online orders), expenses, GST. */
export function MoneySections({
  r,
  online,
  onCheck,
}: {
  r: PeriodReport
  online: OnlinePayments | null
  onCheck: (id: string) => void
}) {
  const navigation = useAppNavigation()
  return (
    <>
      <Disclosure title={translate("period.revenue")} summary={rupees(r.revenue.totalPaise)}>
        {r.revenue.lines.map((l) => (
          <KV
            key={l.item}
            label={translateOr(`period.item.${l.item}`, translateOr(`category.${l.item}`, l.item))}
            value={rupees(l.taxable)}
          />
        ))}
        <KV label={translate("period.gst")} value={rupees(r.revenue.taxPaise)} strong />
      </Disclosure>
      <Disclosure title={translate("period.bookings")}>
        <KV label={translate("dash.bookingsMade")} value={String(r.bookings.made)} />
        <KV label={translate("reports.arrivals")} value={String(r.bookings.arrivals)} />
        <KV label={translate("reports.departures")} value={String(r.bookings.departures)} />
        <KV label={translate("dash.cancellations")} value={String(r.bookings.cancellations)} />
        <KV label={translate("state.no_show")} value={String(r.bookings.noShows)} />
      </Disclosure>
      <Disclosure title={translate("period.sources")}>
        <HBars
          rows={r.sources.map((s) => ({
            label: `${translateOr(`source.${s.source}`, s.source)} · ${s.bookings}`,
            value: s.billed,
          }))}
          format={rupees}
        />
      </Disclosure>
      <Disclosure title={translate("stay.payments")}>
        {r.payments.map((p) => (
          <KV
            key={p.mode}
            label={`${translateOr(`option.${p.mode}`, p.mode.toUpperCase())} · ${p.count}`}
            value={`${rupees(p.received)}${p.refunded ? ` − ${rupees(p.refunded)}` : ""}`}
          />
        ))}
        <KV
          label={translate("reports.outstanding")}
          value={`${r.outstanding.count} · ${rupees(r.outstanding.amountPaise)}`}
          strong
        />
      </Disclosure>
      {!!online?.enabled && (
        <Disclosure title={translate("period.online")} summary={String(online.orders.length)}>
          <ListCard>
            {online.orders.map((o, i) => (
              <ListRow
                key={o.id}
                title={`${o.guestName} · ${rupees(o.amountPaise)}`}
                subtitle={o.failureReason ?? o.gatewayOrderId}
                right={
                  <View style={$right}>
                    <Chip
                      tone={o.status === "paid" ? "ok" : o.status === "created" ? "warn" : "danger"}
                      text={translateOr(`period.order.${o.status}`, o.status)}
                    />
                    {o.status === "created" && (
                      <Button
                        preset="secondary"
                        size="sm"
                        text={translate("period.check")}
                        onPress={() => onCheck(o.id)}
                      />
                    )}
                  </View>
                }
                onPress={() => navigation.navigate("Stay", { id: o.bookingId })}
                last={i === online.orders.length - 1}
              />
            ))}
          </ListCard>
        </Disclosure>
      )}
      <Disclosure title={translate("expense.title")} summary={rupees(r.expenses.totalPaise)}>
        <HBars
          rows={r.expenses.byCategory.map((c) => ({
            label: translateOr(`expense.${c.category}`, c.category),
            value: c.amount,
          }))}
          format={rupees}
        />
      </Disclosure>
      <Disclosure title={translate("period.gst")}>
        {r.tax.map((t) => (
          <KV
            key={t.tax_rate_bp}
            label={`${t.tax_rate_bp / 100}% · ${translate("period.taxable")} ${rupees(t.taxable)}`}
            value={`CGST ${rupees(t.cgst)} · SGST ${rupees(t.sgst)}${t.igst ? ` · IGST ${rupees(t.igst)}` : ""}`}
          />
        ))}
      </Disclosure>
    </>
  )
}

/** Housekeeping, maintenance and the guests who stayed. */
export function OperationsSections({ r }: { r: PeriodReport }) {
  const navigation = useAppNavigation()
  return (
    <>
      <Disclosure title={translate("rooms.assign")}>
        {r.housekeeping.status.map((s) => (
          <KV
            key={s.status}
            label={translateOr(`rooms.status.${s.status}`, s.status)}
            value={String(s.rooms)}
          />
        ))}
        <KV label={translate("period.cleanedBy")} value="" strong />
        {r.housekeeping.cleaned.map((c) => (
          <KV key={c.name} label={c.name} value={String(c.rooms)} />
        ))}
      </Disclosure>
      <Disclosure title={translate("maint.title")}>
        <KV label={translate("period.opened")} value={String(r.maintenance.opened)} />
        <KV label={translate("maint.status.resolved")} value={String(r.maintenance.resolved)} />
        <KV
          label={translate("period.avgHours")}
          value={
            r.maintenance.avg_hours === null ? "—" : String(Math.round(r.maintenance.avg_hours))
          }
        />
        <KV
          label={translate("period.openNow")}
          value={`${r.maintenance.open_now} · ${translate("priority.urgent")} ${r.maintenance.urgent_now}`}
        />
      </Disclosure>
      <Disclosure title={translate("period.guests")} summary={String(r.guests.length)}>
        <ListCard>
          {r.guests.map((g, i) => (
            <ListRow
              key={g.id}
              title={g.name}
              subtitle={`${g.city} · ${g.nights} ${translate("res.nights").toLowerCase()} · ${rupees(g.paid)}`}
              onPress={() => navigation.navigate("Guest", { id: g.id })}
              last={i === r.guests.length - 1}
            />
          ))}
        </ListCard>
      </Disclosure>
    </>
  )
}

const $right: ViewStyle = { alignItems: "flex-end", gap: 4 }
