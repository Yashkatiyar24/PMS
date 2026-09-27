import { useState } from "react"
import { RefreshControl, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  ActionSheet,
  Banner,
  Button,
  Empty,
  Loading,
  PageHeader,
  Screen,
  Segmented,
  showToast,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import type { FolioLine, Receipt } from "@/features/folio/types"
import { useSettingsValues } from "@/features/settings/hooks/useSettingsValues"
import { settingList } from "@/features/settings/types"
import { translate } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatTime } from "@/utils/date"
import { rupees } from "@/utils/format"

import { AccommodationTab } from "../components/stay/AccommodationTab"
import { ActivityTab } from "../components/stay/ActivityTab"
import { BillTab, lineTotal } from "../components/stay/BillTab"
import { GuestTab } from "../components/stay/GuestTab"
import { ReceiptsTab } from "../components/stay/ReceiptsTab"
import { RemoveLineSheet } from "../components/stay/sheets/StateSheets"
import { StayActions, stayMenu, type StaySheet } from "../components/stay/StayActions"
import { StayHeader } from "../components/stay/StayHeader"
import { StaySheets } from "../components/stay/StaySheets"
import { useStay } from "../hooks/useStay"
import { balanceDue } from "../lib/bookingLabels"
import type { Approval, BookingUnit } from "../types"

type Tab = "stay" | "bill" | "guest" | "receipts" | "activity"

/** One stay: header facts, state-driven actions, tabs, overflow menu and every sheet. */
export const StayScreen = observer(function StayScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"Stay">()
  const { has } = usePermission()
  const stay = useStay(params.id)
  const settings = useSettingsValues()
  const [tab, setTab] = useState<Tab>("stay")
  const [sheet, setSheet] = useState<StaySheet>(null)
  const [menu, setMenu] = useState(false)
  const [unit, setUnit] = useState<BookingUnit | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [line, setLine] = useState<FolioLine | null>(null)

  const { booking, folio } = stay
  const can = {
    edit: has("reservations.edit"),
    refund: has("refund"),
    invoice: has("invoice.edit"),
    checkout: has("checkout"),
    checkin: has("checkin"),
  }
  const paymentModes = settingList(settings, "payment_modes", ["cash", "upi"])

  const openReceipt = (r: Receipt) =>
    navigation.navigate("ReceiptViewer", {
      path: api.folios.receiptHtmlPath(r.id),
      title: r.number,
    })

  const checkOut = async (reason: string | null, approval: Approval) => {
    if (!booking) return
    const due = folio ? balanceDue(folio) : 0
    const r = await stay.run(() =>
      api.bookings.checkOut(booking.id, { departAt: null, overrideReason: reason, ...approval }),
    )
    if (r.ok) setSheet(null)
    // A refused checkout (unpaid balance or approval needed) opens the override sheet, as on the web.
    else if (r.status === 403 || (r.status === 409 && due > 0)) setSheet("checkoutOverride")
  }

  const invoice = () => {
    if (!folio) return
    void stay.run(
      () => api.folios.issueInvoice(folio.id),
      (r) => r && openReceipt(r),
    )
  }

  if (stay.loading && !booking)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <Loading />
      </Screen>
    )
  if (!booking)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <PageHeader title={translate("stay.title")} onBack={() => navigation.goBack()} />
        <Empty text={stay.problem?.message} />
      </Screen>
    )

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={$content}
      ScrollViewProps={{
        refreshControl: <RefreshControl refreshing={false} onRefresh={() => void stay.reload()} />,
      }}
    >
      <PageHeader
        title={booking.groupName ?? booking.guestName}
        onBack={() => navigation.goBack()}
        actions={
          <Button
            preset="secondary"
            size="sm"
            text="⋯"
            accessibilityLabel={translate("common.more")}
            onPress={() => setMenu(true)}
            testID="stay-menu"
          />
        }
      />
      {params.checkedInSeconds !== undefined && (
        <Banner
          tone="ok"
          text={translate("checkin.elapsed", { seconds: params.checkedInSeconds })}
        />
      )}
      {booking.state === "pending" && booking.holdUntil && (
        <Banner
          tone="warn"
          text={translate("stay.holdUntil", { time: formatTime(booking.holdUntil) })}
        />
      )}
      <StayHeader booking={booking} folio={folio} />
      <StayActions
        booking={booking}
        folio={folio}
        can={can}
        busy={stay.busy}
        open={setSheet}
        onConfirm={() => void stay.run(() => api.bookings.confirm(booking.id))}
        onArrive={() => void stay.run(() => api.bookings.arrive(booking.id))}
        onCheckOut={() => void checkOut(null, { approverId: null, pin: null })}
        onInvoice={invoice}
      />
      <Segmented<Tab>
        scroll
        value={tab}
        onChange={setTab}
        items={[
          { value: "stay", label: translate("res.tab.stay") },
          { value: "bill", label: translate("res.tab.bill") },
          { value: "guest", label: translate("res.tab.guest") },
          { value: "receipts", label: translate("res.tab.receipts"), count: stay.receipts.length },
          { value: "activity", label: translate("res.tab.activity") },
        ]}
      />
      {tab === "stay" && (
        <AccommodationTab
          booking={booking}
          canEdit={can.edit}
          onChangeUnit={(u) => {
            setUnit(u)
            setSheet("changeUnit")
          }}
          onReleaseUnit={(u) => {
            setUnit(u)
            setSheet("release")
          }}
        />
      )}
      {tab === "bill" && (
        <BillTab
          folio={folio}
          onRemoveLine={(l) => setLine(l)}
          onProvisionalReceipt={(p) =>
            folio &&
            void stay.run(
              () => api.folios.issueProvisional(folio.id, p.amountPaise),
              (r) => r && openReceipt(r),
            )
          }
        />
      )}
      {tab === "guest" && <GuestTab booking={booking} />}
      {tab === "receipts" && (
        <ReceiptsTab
          receipts={stay.receipts}
          canCreditNote={can.invoice || can.checkout}
          onCreditNote={(r) => {
            setReceipt(r)
            setSheet("creditNote")
          }}
        />
      )}
      {tab === "activity" && <ActivityTab bookingId={booking.id} />}

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={translate("common.more")}
        items={stayMenu(booking, folio, can, setSheet, invoice)}
      />
      <StaySheets
        sheet={sheet}
        close={() => setSheet(null)}
        open={setSheet}
        booking={booking}
        folio={folio}
        paymentModes={paymentModes}
        unit={unit}
        receipt={receipt}
        run={stay.run}
        onCheckOut={(reason, approval) => void checkOut(reason, approval)}
        onOpenReceipt={(r) => {
          showToast(r.number, "ok")
          openReceipt(r)
        }}
      />
      {line && folio && (
        <RemoveLineSheet
          open
          onClose={() => setLine(null)}
          line={`${line.description} · ${rupees(lineTotal(line))}`}
          onDone={async (reason, approval) => {
            const r = await stay.run(() =>
              api.folios.removeLine(folio.id, line.id, reason, approval),
            )
            if (r.ok) setLine(null)
          }}
        />
      )}
    </Screen>
  )
})

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 40 }
