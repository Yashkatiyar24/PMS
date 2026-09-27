import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button, Chip, ChoiceChips, Input, Sheet, Text, showError } from "@/components"
import type { Person } from "@/features/rooms/types"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"

import {
  PRIORITIES,
  TICKET_STATUSES,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from "../types"

export type TicketSheetProps = {
  ticket: Ticket
  works: boolean
  technicians: Person[]
  onClose: () => void
  onSaved: () => void
}

/** A ticket: status, assignee, priority, resolution — editable by those who work tickets. */
export function TicketSheet({ ticket, works, technicians, onClose, onSaved }: TicketSheetProps) {
  const { theme } = useAppTheme()
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [assignedTo, setAssignedTo] = useState<string | null>(ticket.assignedTo)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [resolution, setResolution] = useState(ticket.resolution ?? "")
  const needsResolution = (status === "resolved" || status === "closed") && !resolution.trim()

  const save = async () => {
    const r = await api.maintenance.update(ticket.id, {
      status,
      assignedTo,
      priority,
      resolution: resolution.trim() || null,
    })
    if (!r.ok) return showError(r.problem)
    onSaved()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${ticket.roomNumber ?? translate("maint.noRoom")} · ${ticket.issue}`}
      description={`${ticket.reportedByName}`}
      footer={
        works ? (
          <Button
            size="lg"
            text={translate("action.save")}
            onPress={save}
            disabled={needsResolution}
          />
        ) : undefined
      }
    >
      <View style={$chips}>
        <Chip tone="neutral" text={translateOr(`maint.status.${ticket.status}`, ticket.status)} />
        <Chip
          tone={ticket.priority === "urgent" ? "danger" : "warn"}
          text={translateOr(`priority.${ticket.priority}`, ticket.priority)}
        />
        {!!ticket.takesRoomOffSale && (
          <Chip tone="danger" text={translate("rooms.status.maintenance")} />
        )}
      </View>
      {!!ticket.description && (
        <Text text={ticket.description} size="sm" style={{ color: theme.colors.text }} />
      )}
      {works ? (
        <>
          <ChoiceChips
            value={status}
            onChange={setStatus}
            options={TICKET_STATUSES.map((s) => ({
              value: s,
              label: translateOr(`maint.status.${s}`, s),
            }))}
          />
          <Text
            text={translate("maint.assignee")}
            size="xs"
            weight="bold"
            style={{ color: theme.colors.text }}
          />
          <ChoiceChips<string>
            value={assignedTo ?? "none"}
            onChange={(v) => setAssignedTo(v === "none" ? null : v)}
            options={[
              { value: "none", label: translate("rooms.unassigned") },
              ...technicians.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <ChoiceChips
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({ value: p, label: translateOr(`priority.${p}`, p) }))}
          />
          <Input
            label={translate("maint.resolution")}
            hint={translate("maint.resolutionHint")}
            value={resolution}
            onChangeText={setResolution}
            multiline
          />
        </>
      ) : (
        !!ticket.resolution && (
          <Text
            text={`${translate("maint.resolution")}: ${ticket.resolution}`}
            size="sm"
            style={{ color: theme.colors.textDim }}
          />
        )
      )}
    </Sheet>
  )
}

const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
