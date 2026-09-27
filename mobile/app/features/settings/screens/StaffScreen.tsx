import { useState } from "react"
import { Alert } from "react-native"

import {
  ActionSheet,
  Avatar,
  Button,
  Chip,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  showError,
  showToast,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import type { Tone } from "@/theme/tones"
import { APPROVER_ROLES, type StoredRole } from "@/utils/permissions"

import {
  CredentialsSheet,
  InviteSheet,
  PinSheet,
  RoleSheet,
  type Credentials,
} from "../components/StaffSheets"
import type { StaffMember } from "../types"

const ROLE_TONE: Record<string, Tone> = {
  owner: "violet",
  admin: "violet",
  manager: "brand",
  receptionist: "teal",
  staff: "teal",
  housekeeping: "ok",
  accountant: "warn",
  maintenance: "warn",
}

/** Who works here, with what role; invite, change role, reset password, set PIN, remove access. */
export function StaffScreen() {
  const navigation = useAppNavigation()
  const { has, can, user } = usePermission()
  const staff = useResource(() => api.settings.staff(), [], { cacheKey: "staff" })
  const property = useResource(() => api.settings.property(), [], { cacheKey: "property" })
  const [menuFor, setMenuFor] = useState<StaffMember | null>(null)
  const [sheet, setSheet] = useState<"invite" | "role" | "pin" | null>(null)
  const [creds, setCreds] = useState<Credentials | null>(null)
  const list = staff.data ?? []
  const manage = has("staff.manage")
  const code = property.data?.code ?? ""

  const canManage = (m: StaffMember) =>
    manage &&
    m.userId !== user?.id &&
    m.active &&
    (can("OWNER") || (m.role !== "owner" && m.role !== "admin"))
  const canPin = (m: StaffMember) =>
    APPROVER_ROLES.includes(m.role as StoredRole) && (can("OWNER") || m.userId === user?.id)

  const resetPassword = (m: StaffMember) =>
    Alert.alert(translate("setup.resetPassword"), translate("setup.resetConfirm"), [
      { text: translate("action.cancel"), style: "cancel" },
      {
        text: translate("setup.resetPassword"),
        style: "destructive",
        onPress: async () => {
          const r = await api.settings.resetPassword(m.userId)
          if (!r.ok) return showError(r.problem)
          setCreds({ code, email: m.email ?? "", password: r.data.password })
        },
      },
    ])
  const remove = (m: StaffMember) =>
    Alert.alert(translate("setup.deactivate"), translate("setup.deactivateConfirm"), [
      { text: translate("action.cancel"), style: "cancel" },
      {
        text: translate("setup.deactivate"),
        style: "destructive",
        onPress: async () => {
          const r = await api.settings.removeAccess(m.userId)
          if (!r.ok) return showError(r.problem)
          showToast(translate("action.done"), "ok")
          void staff.reload()
        },
      },
    ])

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      <PageHeader
        title={translate("setup.staff")}
        onBack={() => navigation.goBack()}
        actions={
          manage ? (
            <Button size="sm" text={translate("setup.invite")} onPress={() => setSheet("invite")} />
          ) : undefined
        }
      />
      {!!code && (
        <Panel>
          <KV label={translate("setup.code")} value={code} strong />
          <KV label="" value={translate("setup.codeHint")} />
        </Panel>
      )}
      {!!staff.loading && <Loading />}
      {!!staff.problem && !staff.data && (
        <ErrorState message={staff.problem.message} onRetry={staff.reload} />
      )}
      {list.length > 0 && (
        <ListCard>
          {list.map((m, i) => (
            <ListRow
              key={m.userId}
              leading={<Avatar name={m.name} tone={ROLE_TONE[m.role] ?? "neutral"} />}
              title={`${m.name}${m.userId === user?.id ? ` ${translate("staff.you")}` : ""}`}
              subtitle={`${m.phone ?? ""}${m.email ? ` · ${m.email}` : ""}${m.hasPin ? ` · 🔑 ${translate("staff.pinSet")}` : ""}`}
              right={
                m.active ? (
                  <Chip
                    tone={ROLE_TONE[m.role] ?? "neutral"}
                    text={translateOr(`role.${m.role}`, m.role)}
                  />
                ) : (
                  <Chip tone="danger" text={translate("setup.deactivate")} />
                )
              }
              onPress={canManage(m) || canPin(m) ? () => setMenuFor(m) : undefined}
              chevron={canManage(m) || canPin(m)}
              last={i === list.length - 1}
            />
          ))}
        </ListCard>
      )}
      {!!menuFor && (
        <ActionSheet
          open={!sheet}
          onClose={() => setMenuFor(null)}
          title={menuFor.name}
          items={[
            ...(canManage(menuFor)
              ? [
                  { label: translate("setup.role"), onPress: () => setSheet("role") },
                  {
                    label: translate("setup.resetPassword"),
                    onPress: () => resetPassword(menuFor),
                  },
                ]
              : []),
            ...(canPin(menuFor)
              ? [{ label: translate("setup.setPin"), onPress: () => setSheet("pin") }]
              : []),
            ...(canManage(menuFor)
              ? [
                  {
                    label: translate("setup.deactivate"),
                    danger: true,
                    separator: true,
                    onPress: () => remove(menuFor),
                  },
                ]
              : []),
          ]}
        />
      )}
      {sheet === "invite" && (
        <InviteSheet
          onClose={() => setSheet(null)}
          onDone={(c) => {
            setSheet(null)
            void staff.reload()
            if (c) setCreds({ ...c, code })
          }}
        />
      )}
      {sheet === "role" && !!menuFor && (
        <RoleSheet
          member={menuFor}
          onClose={() => {
            setSheet(null)
            setMenuFor(null)
          }}
          onDone={() => {
            setSheet(null)
            setMenuFor(null)
            void staff.reload()
          }}
        />
      )}
      {sheet === "pin" && !!menuFor && (
        <PinSheet
          member={menuFor}
          onClose={() => {
            setSheet(null)
            setMenuFor(null)
          }}
          onDone={() => {
            setSheet(null)
            setMenuFor(null)
            void staff.reload()
          }}
        />
      )}
      {!!creds && <CredentialsSheet creds={creds} onClose={() => setCreds(null)} />}
    </Screen>
  )
}
