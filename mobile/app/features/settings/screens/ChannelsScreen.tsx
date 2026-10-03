import { useState } from "react"
import { Alert, Linking, View, type ViewStyle } from "react-native"

import {
  ActionSheet,
  Avatar,
  Banner,
  Button,
  Chip,
  Empty,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  SectionLabel,
  Text,
  showError,
  showToast,
} from "@/components"
import Config from "@/config"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { formatDate, formatDateTime } from "@/utils/date"

import { brand, LinkSheet } from "../components/ChannelLinkSheet"
import type { ChannelLink } from "../types"

/** The public booking page and OTA calendar links per room. */
export function ChannelsScreen() {
  const navigation = useAppNavigation()
  const { theme } = useAppTheme()
  const overview = useResource(() => api.settings.channels(), [], { cacheKey: "channels" })
  const [menuFor, setMenuFor] = useState<ChannelLink | null>(null)
  const [editing, setEditing] = useState<ChannelLink | "new" | null>(null)
  const o = overview.data
  const pageUrl = o?.bookingSlug
    ? `${Config.API_URL.replace(/\/$/, "")}/book/${o.bookingSlug}`
    : null

  const act = async (
    call: () => Promise<{ ok: boolean; problem?: import("@/services/api").ApiProblem }>,
  ) => {
    const r = await call()
    if (!r.ok && r.problem) return showError(r.problem)
    showToast(translate("action.done"), "ok")
    void overview.reload()
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("channels.title")}
        subtitle={translate("channels.subtitle")}
        onBack={() => navigation.goBack()}
      />
      {!!overview.loading && <Loading />}
      {!!overview.problem && !o && (
        <ErrorState message={overview.problem.message} onRetry={overview.reload} />
      )}
      {!!o && (
        <>
          <Panel>
            <View style={$row}>
              <Text
                text={translate("channels.page")}
                weight="bold"
                style={{ color: theme.colors.text, flex: 1 }}
              />
              <Chip
                tone={o.onlineBookingEnabled ? "ok" : "neutral"}
                text={o.onlineBookingEnabled ? translate("channels.on") : translate("channels.off")}
              />
            </View>
            {pageUrl ? (
              <>
                <KV label="" value={pageUrl} />
                <View style={$row}>
                  <Button
                    preset="secondary"
                    size="sm"
                    text={translate("channels.copy")}
                    onPress={() => showToast(pageUrl, "info", 6000)}
                  />
                  <Button
                    preset="secondary"
                    size="sm"
                    text={translate("channels.open")}
                    onPress={() => void Linking.openURL(pageUrl)}
                  />
                </View>
                <Text
                  text={
                    o.onlineBookingEnabled
                      ? translate("channels.pageOn")
                      : translate("channels.pageOff")
                  }
                  size="xs"
                  style={{ color: theme.colors.textDim }}
                />
              </>
            ) : (
              <Button
                preset="secondary"
                text={translate("channels.createPage")}
                onPress={() => void act(() => api.settings.createBookingPage())}
              />
            )}
          </Panel>
          {o.conflicts.length > 0 && (
            <>
              <Banner
                tone="warn"
                text={translate("channels.conflicts")}
                detail={translate("channels.conflictsHint")}
              />
              <ListCard>
                {o.conflicts.map((c, i) => (
                  <ListRow
                    key={c.id}
                    title={`${translate("channels.room")} ${c.roomNumber} · ${brand(c.channel)}`}
                    subtitle={`${formatDate(c.arriveOn)} → ${formatDate(c.departOn)} · ${c.conflict}`}
                    chevron={false}
                    last={i === o.conflicts.length - 1}
                  />
                ))}
              </ListCard>
            </>
          )}
          <SectionLabel
            text={translate("channels.calendars")}
            right={
              <Button
                size="sm"
                text={translate("channels.add")}
                onPress={() => setEditing("new")}
              />
            }
          />
          <Text
            text={translate("channels.calendarsHint")}
            size="xs"
            style={{ color: theme.colors.textDim }}
          />
          {o.links.length === 0 && <Empty text={translate("channels.none")} />}
          {o.links.length > 0 && (
            <ListCard>
              {o.links.map((l, i) => (
                <ListRow
                  key={l.id}
                  leading={
                    <Avatar
                      icon="globe"
                      tone={l.lastError ? "danger" : l.conflicts > 0 ? "warn" : "teal"}
                    />
                  }
                  title={`${translate("channels.room")} ${l.roomNumber} · ${brand(l.channel)}`}
                  subtitle={
                    l.lastError ??
                    (l.importUrl
                      ? l.lastSyncedAt
                        ? translate("channels.lastSync", { time: formatDateTime(l.lastSyncedAt) })
                        : translate("channels.neverSynced")
                      : translate("channels.exportOnly"))
                  }
                  onPress={() => setMenuFor(l)}
                  last={i === o.links.length - 1}
                />
              ))}
            </ListCard>
          )}
          <Text
            text={translate("channels.dormNote")}
            size="xxs"
            style={{ color: theme.colors.textFaint }}
          />
        </>
      )}
      {!!menuFor && (
        <ActionSheet
          open={!editing}
          onClose={() => setMenuFor(null)}
          title={`${translate("channels.room")} ${menuFor.roomNumber} · ${brand(menuFor.channel)}`}
          items={[
            {
              label: translate("channels.exportUrl"),
              onPress: () =>
                showToast(api.settings.calendarExportUrl(menuFor.exportToken), "info", 8000),
            },
            ...(menuFor.importUrl
              ? [
                  {
                    label: translate("channels.syncNow"),
                    onPress: () => void act(() => api.settings.syncChannel(menuFor.id)),
                  },
                ]
              : []),
            { label: translate("channels.editUrl"), onPress: () => setEditing(menuFor) },
            {
              label: translate("channels.rotate"),
              onPress: () =>
                Alert.alert(translate("channels.rotate"), translate("channels.rotateConfirm"), [
                  { text: translate("action.cancel"), style: "cancel" },
                  {
                    text: translate("channels.rotate"),
                    onPress: () => void act(() => api.settings.rotateChannel(menuFor.id)),
                  },
                ]),
            },
            {
              label: translate("channels.remove"),
              danger: true,
              separator: true,
              onPress: () =>
                Alert.alert(
                  translate("channels.remove"),
                  translate("channels.removeConfirm", {
                    room: menuFor.roomNumber,
                    ota: brand(menuFor.channel),
                  }),
                  [
                    { text: translate("action.cancel"), style: "cancel" },
                    {
                      text: translate("channels.remove"),
                      style: "destructive",
                      onPress: () => void act(() => api.settings.unlinkChannel(menuFor.id)),
                    },
                  ],
                ),
            },
          ]}
        />
      )}
      {!!editing && !!o && (
        <LinkSheet
          link={editing === "new" ? null : editing}
          rooms={o.rooms}
          onClose={() => {
            setEditing(null)
            setMenuFor(null)
          }}
          onDone={() => {
            setEditing(null)
            setMenuFor(null)
            void overview.reload()
          }}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }
