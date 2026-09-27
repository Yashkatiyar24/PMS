import type { Folio, FolioPayment, Receipt } from "@/features/folio/types"
import { writeOrQueue } from "@/features/offline/queueWrite"
import { api } from "@/services/api"
import { newClientUuid } from "@/utils/uuid"

import { EditDetailsSheet, PartySheet, UnitSheet } from "./sheets/DetailSheets"
import { ApprovedMoneySheet, ExtraSheet, PaySheet } from "./sheets/MoneySheets"
import { CancelSheet, CheckoutOverrideSheet, ReleaseSheet } from "./sheets/StateSheets"
import type { StaySheet } from "./StayActions"
import type { useStay } from "../../hooks/useStay"
import { balanceDue } from "../../lib/bookingLabels"
import type { Booking, BookingUnit, FreeUnit } from "../../types"

export type StaySheetsProps = {
  sheet: StaySheet
  close: () => void
  open: (sheet: StaySheet) => void
  booking: Booking
  folio: Folio | null
  paymentModes: string[]
  unit: BookingUnit | null
  receipt: Receipt | null
  run: ReturnType<typeof useStay>["run"]
  onCheckOut: (reason: string, approval: { approverId: string | null; pin: string | null }) => void
  onOpenReceipt: (receipt: Receipt) => void
}

/** Every secondary form of the stay, one at a time. Each performs its call through `run` and closes on success. */
export function StaySheets(p: StaySheetsProps) {
  const { sheet, close, booking, folio, run } = p
  const folioId = folio?.id ?? ""
  const due = folio ? balanceDue(folio) : 0
  const done = async (call: () => ReturnType<typeof run>) => {
    const r = await call()
    if (r.ok) close()
  }

  return (
    <>
      {sheet === "pay" && folio && (
        <PaySheet
          open
          onClose={close}
          duePaise={due}
          modes={p.paymentModes}
          onDone={(b) => {
            const clientUuid = newClientUuid()
            const body = {
              mode: b.mode,
              amountPaise: b.amountPaise,
              reference: "",
              receivedAt: null,
              reason: null,
              clientUuid,
            }
            void done(() =>
              run(() =>
                writeOrQueue(() => api.folios.pay(folioId, body), {
                  clientUuid,
                  path: `/api/folios/${folioId}/payments`,
                  body,
                }),
              ),
            )
          }}
        />
      )}
      {sheet === "extra" && folio && (
        <ExtraSheet
          open
          onClose={close}
          onDone={(b) =>
            void done(() =>
              run(() =>
                api.folios.addLine(folioId, {
                  line: {
                    kind: "extra",
                    description: b.description,
                    qty: b.qty,
                    unitPaise: b.amountPaise,
                    lineDate: null,
                    reason: null,
                    category: b.category,
                  },
                  approverId: null,
                  pin: null,
                }),
              ),
            )
          }
        />
      )}
      {sheet === "discount" && folio && (
        <ApprovedMoneySheet
          open
          onClose={close}
          kind="discount"
          onDone={(b) =>
            void done(() =>
              run(() =>
                api.folios.addLine(folioId, {
                  line: {
                    kind: "discount",
                    description: b.reason,
                    qty: 1,
                    unitPaise: -b.amountPaise,
                    lineDate: null,
                    reason: b.reason,
                    category: null,
                  },
                  approverId: b.approverId,
                  pin: b.pin,
                }),
              ),
            )
          }
        />
      )}
      {sheet === "refund" && folio && (
        <ApprovedMoneySheet
          open
          onClose={close}
          kind="refund"
          maxPaise={folio.paidPaise}
          modes={p.paymentModes}
          onDone={(b) =>
            void done(() =>
              run(() =>
                api.folios.refund(folioId, {
                  payment: {
                    mode: b.mode,
                    amountPaise: b.amountPaise,
                    reference: "",
                    receivedAt: null,
                    reason: b.reason,
                    clientUuid: newClientUuid(),
                  },
                  approverId: b.approverId,
                  pin: b.pin,
                }),
              ),
            )
          }
        />
      )}
      {sheet === "creditNote" && p.receipt && (
        <ApprovedMoneySheet
          open
          onClose={close}
          kind="creditNote"
          maxPaise={p.receipt.amountPaise}
          onDone={(b) =>
            void done(() =>
              run(
                () =>
                  api.folios.creditNote(p.receipt!.id, {
                    amountPaise: b.amountPaise,
                    reason: b.reason,
                    approverId: b.approverId,
                    pin: b.pin,
                  }),
                (r) => r && p.onOpenReceipt(r),
              ),
            )
          }
        />
      )}
      {(sheet === "cancel" || sheet === "noShow") && (
        <CancelSheet
          open
          onClose={close}
          kind={sheet}
          onDone={(reason, approval) =>
            void done(() =>
              run(() =>
                sheet === "cancel"
                  ? api.bookings.cancel(booking.id, { reason, ...approval })
                  : api.bookings.noShow(booking.id, approval),
              ),
            )
          }
        />
      )}
      {sheet === "checkoutOverride" && (
        <CheckoutOverrideSheet
          open
          onClose={close}
          duePaise={due}
          onPay={() => p.open("pay")}
          onDone={p.onCheckOut}
        />
      )}
      {sheet === "editDetails" && (
        <EditDetailsSheet
          open
          onClose={close}
          booking={booking}
          onDone={(details, notes) =>
            void done(() => run(() => api.bookings.updateDetails(booking.id, { details, notes })))
          }
        />
      )}
      {sheet === "party" && (
        <PartySheet
          open
          onClose={close}
          booking={booking}
          onDone={(members) =>
            void done(() => run(() => api.bookings.setMembers(booking.id, members)))
          }
        />
      )}
      {(sheet === "addUnit" || sheet === "changeUnit") && (
        <UnitSheet
          open
          onClose={close}
          booking={booking}
          changing={sheet === "changeUnit" ? p.unit : null}
          onDone={(u: FreeUnit) => {
            const target = { roomId: u.roomId, bedId: u.bedId, ratePaise: null }
            void done(() =>
              run(() =>
                sheet === "changeUnit" && p.unit
                  ? api.bookings.changeUnit(booking.id, p.unit.id, target, {
                      approverId: null,
                      pin: null,
                    })
                  : api.bookings.addUnit(booking.id, target),
              ),
            )
          }}
        />
      )}
      {sheet === "release" && p.unit && (
        <ReleaseSheet
          open
          onClose={close}
          unitLabel={p.unit.roomNumber}
          onDone={(approval) =>
            void done(() => run(() => api.bookings.releaseUnit(booking.id, p.unit!.id, approval)))
          }
        />
      )}
    </>
  )
}

export type { FolioPayment }
