import { View, type ViewStyle } from "react-native"

import { Button, Chip, KV, ListCard, ListRow, Panel, SectionLabel } from "@/components"
import type { Folio, FolioLine, FolioPayment } from "@/features/folio/types"
import { translate, translateOr } from "@/i18n/translate"
import { formatDate, formatDateTime } from "@/utils/date"
import { rupees } from "@/utils/format"

import { balanceDue } from "../../lib/bookingLabels"

export type BillTabProps = {
  folio: Folio | null
  onProvisionalReceipt: (payment: FolioPayment) => void
  /** Offered on charges someone added; room charges follow the stay's dates instead. */
  onRemoveLine?: (line: FolioLine) => void
}

/** What one bill line adds up to, GST included. */
export function lineTotal(l: FolioLine): number {
  return l.unitPaise * l.qty + l.cgstPaise + l.sgstPaise + l.igstPaise
}

/** Bill lines with GST, totals, and payments with a receipt button each. */
export function BillTab({ folio, onProvisionalReceipt, onRemoveLine }: BillTabProps) {
  if (!folio) return null
  const due = balanceDue(folio)
  const removable = (l: FolioLine) => !!onRemoveLine && !l.auto && folio.status === "open"
  return (
    <View style={$wrap}>
      <ListCard>
        {folio.lines.map((l, i) => (
          <ListRow
            key={l.id}
            title={l.description}
            subtitle={`${formatDate(l.lineDate)}${l.qty > 1 ? ` · ${l.qty} × ${rupees(l.unitPaise)}` : ""}${l.taxRateBp > 0 ? ` · GST ${l.taxRateBp / 100}%${l.igstPaise > 0 ? " + IGST" : ""}` : ""}`}
            leading={
              l.category && l.category !== "room" ? (
                <Chip tone="neutral" text={translateOr(`category.${l.category}`, l.category)} />
              ) : undefined
            }
            right={
              <View style={$lineRight}>
                <KV
                  label=""
                  value={rupees(lineTotal(l))}
                  strong
                  tone={lineTotal(l) < 0 ? "ok" : undefined}
                />
                {removable(l) && (
                  <Button
                    preset="ghost"
                    size="sm"
                    icon="close"
                    accessibilityLabel={`${translate("stay.removeLine")}: ${l.description}`}
                    onPress={() => onRemoveLine?.(l)}
                    testID={`remove-line-${i}`}
                  />
                )}
              </View>
            }
            chevron={false}
            last={i === folio.lines.length - 1}
          />
        ))}
      </ListCard>
      <Panel>
        <KV label={translate("stay.total")} value={rupees(folio.totalPaise)} strong />
        {folio.depositHeldPaise !== 0 && (
          <KV label={translate("stay.deposit")} value={rupees(folio.depositHeldPaise)} />
        )}
        <KV label={translate("stay.paid")} value={rupees(folio.paidPaise)} tone="ok" />
        <KV
          label={translate("stay.balance")}
          value={rupees(due)}
          strong
          tone={due > 0 ? "danger" : "ok"}
        />
      </Panel>
      {folio.payments.length > 0 && (
        <>
          <SectionLabel text={translate("stay.payments")} />
          <ListCard>
            {folio.payments.map((p, i) => (
              <ListRow
                key={p.id}
                title={`${rupees(Math.abs(p.amountPaise))} · ${translateOr(`option.${p.mode}`, p.mode.toUpperCase())}`}
                subtitle={`${formatDateTime(p.receivedAt)}${p.reference ? ` · ${p.reference}` : ""}${p.reason ? ` · ${p.reason}` : ""}`}
                leading={
                  p.refund ? <Chip tone="warn" text={translate("stay.refund")} /> : undefined
                }
                right={
                  !p.refund ? (
                    <Button
                      preset="secondary"
                      size="sm"
                      text={translate("stay.receipt")}
                      onPress={() => onProvisionalReceipt(p)}
                    />
                  ) : undefined
                }
                chevron={false}
                last={i === folio.payments.length - 1}
              />
            ))}
          </ListCard>
        </>
      )}
    </View>
  )
}

const $wrap: ViewStyle = { gap: 12 }
const $lineRight: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 4 }
