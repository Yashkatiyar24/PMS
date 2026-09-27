import { useEffect, useState } from "react"
import { Alert, View, type ViewStyle } from "react-native"
import { observer } from "mobx-react-lite"

import {
  Button,
  ErrorState,
  Input,
  Loading,
  PageHeader,
  Screen,
  Text,
  showError,
  showToast,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"

import { SettingRow } from "../components/SettingRow"
import {
  canEdit,
  changedFromDefault,
  effectiveValue,
  matchesQuery,
  resetDraft,
  setDraft,
  type Draft,
} from "../lib/settingsDraft"
import type { Registry, SettingValues } from "../types"

/** One registry group (or a search across all): rows generated from the definitions; one PATCH on Save. */
export const SettingsGroupScreen = observer(function SettingsGroupScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"SettingsGroup">()
  const { theme } = useAppTheme()
  const { can, isSuperAdmin } = usePermission()
  const registry = useResource<Registry>(() => api.settings.registry(), [], {
    cacheKey: "registry",
  })
  const values = useResource<SettingValues>(() => api.settings.values(), [], {
    cacheKey: "settings",
  })
  const [draft, setDraftState] = useState<Draft>({})
  const [q, setQ] = useState(params.group === "search" ? "" : "")
  const [saving, setSaving] = useState(false)
  const dirty = Object.keys(draft).length

  const rank = can("OWNER") ? "OWNER" : can("MANAGER") ? "MANAGER" : null
  const defs = (registry.data?.definitions ?? []).filter(
    (d) =>
      (d.who !== "SUPER_ADMIN" || isSuperAdmin) &&
      (params.group === "search"
        ? matchesQuery(d, translateOr(`setting.${d.key}`, d.key), q)
        : d.group === params.group),
  )
  const title =
    params.group === "search"
      ? translate("settings.search")
      : translateOr(
          `settings.group.${params.group}`,
          registry.data?.groups[params.group] ?? params.group,
        )

  // Leaving with unsaved edits asks first, as the web's beforeunload does.
  useEffect(() => {
    if (!dirty) return
    return navigation.addListener("beforeRemove", (e) => {
      e.preventDefault()
      Alert.alert(translate("settings.unsaved", { n: dirty }), translate("mobile.unsavedChanges"), [
        { text: translate("mobile.stay"), style: "cancel" },
        {
          text: translate("mobile.leave"),
          style: "destructive",
          onPress: () => navigation.dispatch(e.data.action),
        },
      ])
    })
  }, [dirty, navigation])

  const save = async () => {
    setSaving(true)
    const result = await api.settings.update(draft)
    setSaving(false)
    if (!result.ok) return showError(result.problem)
    setDraftState({})
    values.set(() => result.data)
    showToast(translate("settings.savedAt"), "ok")
  }

  const v = values.data ?? {}
  return (
    <View style={$fill}>
      <Screen
        preset="scroll"
        safeAreaEdges={["top"]}
        contentContainerStyle={$content}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title={title}
          subtitle={translate("settings.summary", {
            n: defs.length,
            c: changedFromDefault(defs, v),
          })}
          onBack={() => navigation.goBack()}
        />
        {params.group === "search" && (
          <Input
            value={q}
            onChangeText={setQ}
            placeholder={translate("settings.search")}
            autoFocus
          />
        )}
        {(registry.loading || values.loading) && !registry.data && <Loading />}
        {registry.problem && !registry.data && (
          <ErrorState message={registry.problem.message} onRetry={registry.reload} />
        )}
        {registry.data && defs.length === 0 && (
          <Text
            text={translate("settings.noResults", { q })}
            size="sm"
            style={{ color: theme.colors.textDim }}
          />
        )}
        {defs.map((def) => (
          <SettingRow
            key={def.key}
            def={def}
            value={effectiveValue(def, v, draft)}
            inDraft={def.key in draft}
            editable={canEdit(def, rank, isSuperAdmin)}
            onChange={(value) => setDraftState((d) => setDraft(d, def, v, value))}
            onReset={() => setDraftState((d) => resetDraft(d, def, v))}
          />
        ))}
      </Screen>
      {dirty > 0 && (
        <View
          style={[
            $bar,
            { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
          ]}
        >
          <Text
            text={translate("settings.unsaved", { n: dirty })}
            size="sm"
            weight="bold"
            style={{ color: theme.colors.text, flex: 1 }}
          />
          <Button
            preset="ghost"
            size="sm"
            text={translate("settings.discard")}
            onPress={() => setDraftState({})}
          />
          <Button
            size="sm"
            text={translate("settings.saveChanges")}
            onPress={save}
            disabled={saving}
          />
        </View>
      )}
    </View>
  )
})

const $fill: ViewStyle = { flex: 1 }
const $content: ViewStyle = { padding: 16, paddingBottom: 96 }
const $bar: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  padding: 12,
  paddingBottom: 24,
  borderTopWidth: 1,
}
