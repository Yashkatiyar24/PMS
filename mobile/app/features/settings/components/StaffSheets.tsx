import { useState } from "react"

import {
  Banner,
  Button,
  ChoiceChips,
  Input,
  KV,
  Panel,
  Sheet,
  showError,
  showToast,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { digitsOnly } from "@/utils/format"
import { canGrantRole, GRANTABLE_ROLES, type StoredRole } from "@/utils/permissions"
import { check, emailSchema, pinSchema } from "@/utils/validation"

import type { StaffMember } from "../types"

export type Credentials = { code: string; email: string; password?: string }

function RoleChips({
  value,
  onChange,
}: {
  value: StoredRole | null
  onChange: (r: StoredRole) => void
}) {
  const { user } = usePermission()
  return (
    <ChoiceChips<StoredRole>
      value={value}
      onChange={onChange}
      options={GRANTABLE_ROLES.map((r) => ({
        value: r,
        label: translateOr(`role.${r}`, r),
        disabled: !canGrantRole(user?.role, r),
      }))}
    />
  )
}

/** Invite: name, mobile, email, role → a one-time password to hand over. */
export function InviteSheet({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (creds: Omit<Credentials, "code"> | null) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<StoredRole | null>("receptionist")
  const ready =
    name.trim() && digitsOnly(phone).length >= 10 && check(emailSchema, email).ok && role
  const submit = async () => {
    if (!role) return
    const r = await api.settings.invite({
      name: name.trim(),
      phone: digitsOnly(phone),
      email: email.trim(),
      role,
    })
    if (!r.ok) return showError(r.problem)
    onDone({ email: r.data.email ?? email.trim(), password: r.data.password })
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("setup.invite")}
      footer={
        <Button size="lg" text={translate("setup.invite")} onPress={submit} disabled={!ready} />
      }
    >
      <Input label={translate("setup.name")} value={name} onChangeText={setName} autoFocus />
      <Input
        label={translate("checkin.phoneLookup")}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Input
        label={translate("setup.email")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <RoleChips value={role} onChange={setRole} />
    </Sheet>
  )
}

/** Change a member's role. */
export function RoleSheet({
  member,
  onClose,
  onDone,
}: {
  member: StaffMember
  onClose: () => void
  onDone: () => void
}) {
  const [role, setRole] = useState<StoredRole | null>(member.role as StoredRole)
  const submit = async () => {
    if (!role) return
    const r = await api.settings.setRole(member.userId, role)
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("setup.role")}
      description={member.name}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!role || role === member.role}
        />
      }
    >
      <RoleChips value={role} onChange={setRole} />
    </Sheet>
  )
}

/** Set an approval PIN (4–6 digits). */
export function PinSheet({
  member,
  onClose,
  onDone,
}: {
  member: StaffMember
  onClose: () => void
  onDone: () => void
}) {
  const [pin, setPin] = useState("")
  const submit = async () => {
    const r = await api.settings.setPin(member.userId, pin)
    if (!r.ok) return showError(r.problem)
    showToast(translate("action.done"), "ok")
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("setup.setPin")}
      description={member.name}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!check(pinSchema, pin).ok}
        />
      }
    >
      <Input
        label={translate("approval.pin")}
        hint={translate("mobile.pinHint")}
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoFocus
      />
    </Sheet>
  )
}

/** Sign-in details shown once, with a copy button. */
export function CredentialsSheet({ creds, onClose }: { creds: Credentials; onClose: () => void }) {
  const text = `${translate("setup.code")}: ${creds.code}\n${translate("setup.email")}: ${creds.email}${creds.password ? `\n${translate("login.password")}: ${creds.password}` : ""}`
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("credentials.title")}
      footer={
        <Button
          size="lg"
          text={translate("mobile.copy")}
          onPress={() => showToast(text, "info", 8000)}
        />
      }
    >
      {creds.password ? (
        <Banner
          tone="warn"
          text={translate("credentials.once")}
          detail={translate("credentials.changeAfter")}
        />
      ) : (
        <Banner tone="info" text={translate("credentials.existing")} />
      )}
      <Panel>
        <KV label={translate("setup.code")} value={creds.code} strong />
        <KV label={translate("setup.email")} value={creds.email} />
        {!!creds.password && (
          <KV label={translate("login.password")} value={creds.password} strong />
        )}
      </Panel>
    </Sheet>
  )
}
