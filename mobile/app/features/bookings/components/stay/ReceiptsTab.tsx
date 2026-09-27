import { View, type ViewStyle } from "react-native"

import { Button, Empty, ListCard, ListRow } from "@/components"
import type { Receipt } from "@/features/folio/types"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDateTime } from "@/utils/date"
import { rupees } from "@/utils/format"

export type ReceiptsTabProps = {
  receipts: Receipt[]
  canCreditNote: boolean
  onCreditNote: (receipt: Receipt) => void
}

/** Issued receipts: open to print, or raise a credit note against an invoice. */
export function ReceiptsTab({ receipts, canCreditNote, onCreditNote }: ReceiptsTabProps) {
  const navigation = useAppNavigation()
  if (receipts.length === 0) return <Empty text={translate("empty.receipts")} />
  const open = (r: Receipt) =>
    navigation.navigate("ReceiptViewer", {
      path: api.folios.receiptHtmlPath(r.id),
      title: r.number,
    })
  return (
    <ListCard>
      {receipts.map((r, i) => (
        <ListRow
          key={r.id}
          title={`${r.number} · ${translateOr(`option.${r.kind}`, r.kind.replace(/_/g, " "))}`}
          subtitle={`${formatDateTime(r.issuedAt)} · ${rupees(r.amountPaise)}`}
          right={
            <View style={$actions}>
              <Button
                preset="secondary"
                size="sm"
                text={translate("action.print")}
                onPress={() => open(r)}
              />
              {!!canCreditNote && (r.kind === "invoice" || r.kind === "donation") && (
                <Button
                  preset="ghost"
                  size="sm"
                  text={translate("stay.creditNote")}
                  onPress={() => onCreditNote(r)}
                />
              )}
            </View>
          }
          chevron={false}
          last={i === receipts.length - 1}
        />
      ))}
    </ListCard>
  )
}

const $actions: ViewStyle = { alignItems: "flex-end", gap: 4 }
