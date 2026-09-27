import {
  Banner,
  ChoiceChips,
  DateField,
  Disclosure,
  Panel,
  SectionLabel,
  Stepper,
} from "@/components"
import type { RoomType } from "@/features/rooms/types"
import { translate } from "@/i18n/translate"
import { today } from "@/utils/date"
import { rupees } from "@/utils/format"

import type { NewBookingForm } from "../../hooks/useNewBookingForm"
import type { FreeUnit } from "../../types"
import { UnitPicker } from "../UnitPicker"

export type RoomAndDatesCardProps = {
  form: NewBookingForm
  patch: (p: Partial<NewBookingForm>) => void
  roomTypes: RoomType[]
  free: FreeUnit[]
  onToggleUnit: (u: FreeUnit) => void
}

/** Dates, room type (or the group's units), party size, and an optional particular unit. */
export function RoomAndDatesCard({
  form,
  patch,
  roomTypes,
  free,
  onToggleUnit,
}: RoomAndDatesCardProps) {
  const isGroup = form.source === "group"
  return (
    <Panel>
      <DateField
        label={translate("booking.arrival")}
        value={form.arrive}
        min={today()}
        onChange={(arrive) =>
          patch({ arrive, depart: form.depart <= arrive ? arrive : form.depart })
        }
      />
      <DateField
        label={translate("booking.departure")}
        value={form.depart}
        min={form.arrive}
        onChange={(depart) => patch({ depart })}
      />
      {!isGroup && (
        <ChoiceChips
          value={form.roomTypeId}
          onChange={(roomTypeId) => patch({ roomTypeId, units: [] })}
          options={roomTypes
            .filter((t) => t.active)
            .map((t) => ({ value: t.id, label: `${t.name} · ${rupees(t.baseRatePaise)}` }))}
        />
      )}
      <Stepper
        label={translate("checkin.adults")}
        value={form.adults}
        min={1}
        onChange={(adults) => patch({ adults })}
      />
      <Stepper
        label={translate("checkin.children")}
        value={form.children}
        onChange={(children) => patch({ children })}
      />
      {isGroup ? (
        <>
          <SectionLabel text={translate("booking.pickUnits")} />
          {free.length === 0 ? (
            <Banner tone="info" text={translate("booking.pickUnitsHint")} />
          ) : (
            <UnitPicker
              units={free}
              selected={form.units}
              onToggle={onToggleUnit}
              showStatus={false}
            />
          )}
        </>
      ) : (
        <Disclosure
          title={translate("booking.specificUnit")}
          summary={
            form.units.length
              ? translate("booking.selected", { n: form.units.length })
              : translate("booking.anyRoom")
          }
        >
          <UnitPicker
            units={free}
            roomTypeIds={form.roomTypeId ? [form.roomTypeId] : []}
            selected={form.units}
            onToggle={onToggleUnit}
            showStatus={false}
          />
        </Disclosure>
      )}
    </Panel>
  )
}
