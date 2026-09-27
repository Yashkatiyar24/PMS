import { Alert, View, type ViewStyle } from "react-native"

import { Avatar, Button, Chip, ListCard, ListRow, SectionLabel, showError } from "@/components"
import type { Credentials } from "@/features/settings/components/StaffSheets"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"

import type { TeamMember } from "../types"

export type TeamListProps = {
  members: TeamMember[]
  propertyId: string
  code: string
  onCredentials: (creds: Credentials) => void
}

/** A property's team from the platform side, with a password reset per member. */
export function TeamList({ members, propertyId, code, onCredentials }: TeamListProps) {
  const reset = (m: TeamMember) =>
    Alert.alert(
      translate("admin.resetPassword"),
      translate("admin.resetConfirm", { name: m.name }),
      [
        { text: translate("action.cancel"), style: "cancel" },
        {
          text: translate("admin.resetPassword"),
          style: "destructive",
          onPress: async () => {
            const r = await api.admin.resetPassword(propertyId, m.userId)
            if (!r.ok) return showError(r.problem)
            onCredentials({ code, email: r.data.email, password: r.data.password })
          },
        },
      ],
    )
  return (
    <>
      <SectionLabel text={translate("admin.team")} />
      <ListCard>
        {members.map((m, i) => (
          <ListRow
            key={m.userId}
            leading={<Avatar name={m.name} tone="brand" />}
            title={m.name}
            subtitle={m.phone ?? ""}
            right={
              <View style={$chips}>
                <Chip tone="neutral" text={translateOr(`role.${m.role}`, m.role)} />
                <Button
                  preset="ghost"
                  size="sm"
                  text={translate("admin.resetPassword")}
                  onPress={() => reset(m)}
                />
              </View>
            }
            chevron={false}
            last={i === members.length - 1}
          />
        ))}
      </ListCard>
    </>
  )
}

const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }
