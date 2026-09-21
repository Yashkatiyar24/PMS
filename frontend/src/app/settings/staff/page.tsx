"use client"

/**
 * Who works here (PRD U1, U2). One login per person, because a shared login makes the audit log meaningless.
 * Inviting costs a name and a mobile number; the person gets a first password, shown once, and signs in with the
 * property's code, their number and that password, which they then change.
 * Removing access signs them out everywhere within a minute.
 */
import { useState } from "react"
import { KeyRound, RotateCcwKey, Shield, UserMinus, UserPlus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Card, Chip, ChoiceChips, Field, ListCard, ListRow, Loading, Menu, PageHeader, Sheet, type MenuItem, type Tone } from "@/components/ui"
import { Credentials } from "@/components/Credentials"
import { SplitPage } from "@/components/SplitPage"

const ROLES = ["receptionist", "housekeeping", "maintenance", "accountant", "manager", "admin", "owner", "staff"] as const
type Member = { userId: string; name: string; phone: string; email: string | null; role: (typeof ROLES)[number]; active: boolean; hasPin: boolean }
const ROLE_TONE: Record<Member["role"], Tone> = {
  owner: "violet", admin: "violet", manager: "brand", staff: "teal", receptionist: "teal", housekeeping: "ok", maintenance: "warn", accountant: "info",
}
/** Roles that approve someone else's discount, refund, cancellation or credit note, and so have a PIN. */
const APPROVERS: Member["role"][] = ["owner", "admin", "manager", "accountant"]

export default function StaffPage() {
  const { t } = useI18n()
  const { can, has, user } = useSession()
  const { data: members, reload } = useResource(() => api<Member[]>("/api/users"), [], t("error.generic"))
  const { data: property } = useResource(() => api<{ code: string }>("/api/property"), [], t("error.generic"))

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<Member["role"]>("receptionist")
  const [pinFor, setPinFor] = useState<Member | null>(null)
  const [pin, setPin] = useState("")
  const [roleFor, setRoleFor] = useState<Member | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [resetting, setResetting] = useState<Member | null>(null)
  // Sign-in details just created, shown once.
  const [issued, setIssued] = useState<{ name: string; phone: string; password?: string | null } | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  if (!members) return <Loading />

  const roleLabel = (r: string) => t(`role.${r}` as "role.owner")
  // "staff" is the old name for a receptionist: kept for people who have it, not offered to new ones.
  const grantable = ROLES.filter((r) => r !== "staff" && (can("OWNER") || !["owner", "admin"].includes(r)))

  const actionsFor = (m: Member): MenuItem[] => {
    if (!m.active) return []
    const me = m.userId === user?.id
    // Only an owner changes an owner or an admin; an admin manages everyone else.
    const manage = has("staff.manage") && !me && (can("OWNER") || !["owner", "admin"].includes(m.role))
    return [
      ...(manage ? [{ label: t("setup.role"), icon: Shield, onSelect: () => setRoleFor(m) }] : []),
      ...(manage ? [{ label: t("setup.resetPassword"), icon: RotateCcwKey, onSelect: () => setResetting(m) }] : []),
      ...(APPROVERS.includes(m.role) && (can("OWNER") || me) ? [{ label: t("setup.setPin"), icon: KeyRound, onSelect: () => { setPinFor(m); setPin("") } }] : []),
      ...(manage ? [{ label: t("setup.deactivate"), icon: UserMinus, onSelect: () => setRemoving(m), danger: true, separator: true }] : []),
    ]
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("setup.staff")}
        subtitle={`${members.filter((m) => m.active).length}`}
        back="/settings"
        actions={has("staff.manage") ? <Button size="sm" onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden /> {t("setup.invite")}</Button> : undefined}
      />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      <SplitPage
        aside={property && (
          <Card title={t("setup.code")}>
            <p className="min-w-0 truncate font-mono text-2xl font-bold tracking-wider">{property.code}</p>
            <p className="mt-1.5 text-xs text-ink-faint">{t("setup.codeHint")}</p>
          </Card>
        )}
        asideFirst
      >
      <ListCard>
        {members.map((m) => {
          const items = actionsFor(m)
          return (
            <ListRow
              key={m.userId}
              leading={<Avatar name={m.name} tone={m.active ? ROLE_TONE[m.role] : "neutral"} />}
              title={<span className={m.active ? "" : "line-through opacity-60"}>{m.name}{m.userId === user?.id && <span className="ml-1.5 text-xs font-normal text-ink-faint">{t("staff.you")}</span>}</span>}
              subtitle={m.phone}
              right={
                <span className="flex items-center gap-1.5">
                  {!m.active ? <Chip tone="danger">{t("setup.deactivate")}</Chip> : <Chip tone={ROLE_TONE[m.role] ?? "neutral"}>{roleLabel(m.role)}</Chip>}
                  {m.hasPin && m.active && <KeyRound size={14} aria-label={t("staff.pinSet")} className="text-ink-faint" />}
                  {items.length > 0 && <Menu items={items} />}
                </span>
              }
            />
          )
        })}
      </ListCard>
      </SplitPage>

      <Sheet open={inviting} onOpenChange={setInviting} title={t("setup.invite")}
        footer={
          <Button size="lg" className="w-full" disabled={busy || !name.trim() || phone.replace(/\D/g, "").length < 10}
            onClick={() => run(async () => {
              const added = await api<Member & { password?: string | null }>("/api/users", { method: "POST", body: { name, phone, email: null, role } })
              setInviting(false); setName(""); setPhone("")
              setIssued({ name: added.name, phone: added.phone, password: added.password })
            })}>
            {t("setup.invite")}
          </Button>
        }>
        <div className="space-y-3">
          <Field label={t("setup.name")}><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label={t("login.phone")}><input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" /></Field>
          <Field group label={t("setup.role")}><ChoiceChips value={role} onChange={setRole} options={grantable.map((r) => ({ value: r, label: roleLabel(r) }))} /></Field>
        </div>
      </Sheet>

      <Sheet open={!!roleFor} onOpenChange={(o) => !o && setRoleFor(null)} title={roleFor?.name ?? ""} description={t("setup.role")}>
        {roleFor && (
          <ChoiceChips
            value={roleFor.role}
            onChange={(r) => run(async () => { await api(`/api/users/${roleFor.userId}/role`, { method: "PATCH", body: { role: r } }); setRoleFor(null) })}
            options={grantable.map((r) => ({ value: r, label: roleLabel(r) }))}
            disabled={busy}
          />
        )}
      </Sheet>

      <Sheet open={!!pinFor} onOpenChange={(o) => !o && setPinFor(null)} title={t("setup.setPin")} description={pinFor?.name}
        footer={
          <Button size="lg" className="w-full" disabled={busy || !/^\d{4,6}$/.test(pin)}
            onClick={() => pinFor && run(async () => { await api(`/api/users/${pinFor.userId}/pin`, { method: "POST", body: { pin } }); setPinFor(null) })}>
            {t("action.save")}
          </Button>
        }>
        <Field label={t("approval.pin")}>
          <input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} autoFocus className="text-center text-2xl tracking-[.4em]" />
        </Field>
      </Sheet>

      <Sheet open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={t("setup.deactivate")} description={removing?.name}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setRemoving(null)}>{t("action.cancel")}</Button>
            <Button variant="danger" className="flex-1" disabled={busy}
              onClick={() => removing && run(async () => { await api(`/api/users/${removing.userId}`, { method: "DELETE" }); setRemoving(null) })}>
              {t("setup.deactivate")}
            </Button>
          </>
        }>
        <p className="text-sm text-ink-soft">{t("setup.deactivateConfirm")}</p>
      </Sheet>

      <Sheet open={!!resetting} onOpenChange={(o) => !o && setResetting(null)} title={t("setup.resetPassword")} description={resetting?.name}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setResetting(null)}>{t("action.cancel")}</Button>
            <Button className="flex-1" disabled={busy}
              onClick={() => resetting && run(async () => {
                const { password } = await api<{ password: string }>(`/api/users/${resetting.userId}/password`, { method: "POST" })
                setIssued({ name: resetting.name, phone: resetting.phone, password })
                setResetting(null)
              })}>
              {t("setup.resetPassword")}
            </Button>
          </>
        }>
        <p className="text-sm text-ink-soft">{t("setup.resetConfirm")}</p>
      </Sheet>

      <Sheet open={!!issued} onOpenChange={(o) => !o && setIssued(null)} title={t("credentials.title")} description={issued?.name}>
        {issued && <Credentials code={property?.code ?? ""} phone={issued.phone} password={issued.password} />}
      </Sheet>
    </div>
  )
}
