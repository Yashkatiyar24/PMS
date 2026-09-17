"use client"

/**
 * Who works here (PRD U1, U2). One login per person, because a shared login makes the audit log meaningless.
 * Inviting costs a name and a mobile number; the person signs in with a code, so no password is shared.
 * Removing access signs them out everywhere within a minute.
 */
import { useState } from "react"
import Link from "next/link"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Field, Loading } from "@/components/ui"

type Member = {
  userId: string
  name: string
  phone: string
  email: string | null
  role: "owner" | "manager" | "staff"
  active: boolean
  hasPin: boolean
}

export default function StaffPage() {
  const { t } = useI18n()
  const { can, user } = useSession()
  const { data: members, reload } = useResource(() => api<Member[]>("/api/users"), [], t("error.generic"))

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState("staff")
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [removing, setRemoving] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("setup.staff")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.userId}>
            <Card className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{member.name}</p>
                  <p className="text-sm text-[var(--color-ink-soft)]">{member.phone}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Chip tone={member.role === "owner" ? "info" : member.role === "manager" ? "ok" : "neutral"}>{member.role}</Chip>
                  {!member.active && <Chip tone="danger">{t("setup.deactivate")}</Chip>}
                  {member.hasPin && <Chip tone="neutral">PIN ✓</Chip>}
                </div>
              </div>

              {member.active && (
                <div className="flex flex-wrap gap-2">
                  {can("OWNER") && member.userId !== user?.id && (
                    <select
                      className="max-w-36"
                      value={member.role}
                      onChange={(e) => run(async () => { await api(`/api/users/${member.userId}/role`, { method: "PATCH", body: { role: e.target.value } }) })}
                    >
                      <option value="staff">staff</option>
                      <option value="manager">manager</option>
                      <option value="owner">owner</option>
                    </select>
                  )}
                  {member.role !== "staff" && (can("OWNER") || member.userId === user?.id) && (
                    <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => { setPinFor(member.userId); setPin("") }}>
                      {t("setup.setPin")}
                    </Button>
                  )}
                  {can("OWNER") && member.userId !== user?.id && (
                    <Button variant="ghost" className="px-3 py-2 text-sm" onClick={() => setRemoving(member.userId)}>
                      {t("setup.deactivate")}
                    </Button>
                  )}
                </div>
              )}

              {pinFor === member.userId && (
                <div className="space-y-2 border-t border-[var(--color-line)] pt-2">
                  <Field label={t("approval.pin")}>
                    <input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={busy || !/^\d{4,6}$/.test(pin)}
                      onClick={() => run(async () => { await api(`/api/users/${member.userId}/pin`, { method: "POST", body: { pin } }); setPinFor(null) })}
                    >
                      {t("action.save")}
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => setPinFor(null)}>
                      {t("action.cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {removing === member.userId && (
                <div className="space-y-2 border-t border-[var(--color-line)] pt-2">
                  <p className="text-sm text-[var(--color-ink-soft)]">{t("setup.deactivateConfirm")}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => run(async () => { await api(`/api/users/${member.userId}`, { method: "DELETE" }); setRemoving(null) })}
                    >
                      {t("action.done")}
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => setRemoving(null)}>
                      {t("action.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {can("OWNER") &&
        (inviting ? (
          <Card className="space-y-3">
            <Field label={t("setup.name")}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("login.phone")}>
              <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
            </Field>
            <Field label={t("setup.role")}>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="staff">staff</option>
                <option value="manager">manager</option>
                <option value="owner">owner</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy || !name.trim() || phone.replace(/\D/g, "").length < 10}
                onClick={() => run(async () => {
                  await api("/api/users", { method: "POST", body: { name, phone, email: null, role } })
                  setInviting(false)
                  setName("")
                  setPhone("")
                })}
              >
                {t("setup.invite")}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setInviting(false)}>
                {t("action.cancel")}
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setInviting(true)}>
            {t("setup.invite")}
          </Button>
        ))}

      <Link href="/settings">
        <Button variant="ghost" className="w-full">
          {t("action.back")}
        </Button>
      </Link>
    </div>
  )
}
