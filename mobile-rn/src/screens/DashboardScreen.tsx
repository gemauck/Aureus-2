import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'
import { WidgetCard } from '../components/dashboard/WidgetCard'
import {
  DEFAULT_DASHBOARD_CONFIG,
  getQuickActionDefs,
  getWidgetDefs,
  loadDashboardConfig,
  visibleQuickActions,
  visibleWidgets,
  type DashboardConfig,
  type DashboardWidgetId
} from '../dashboard/dashboardConfig'
import { openJobCard, openModule, openNotification, openTask } from '../dashboard/dashboardNavigation'
import { erpApi, mergeDashboardTasks, type DashboardJobCard, type DashboardNotification, type DashboardTask } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import { useNotificationUnread } from '../notifications/NotificationUnreadContext'

import type { RootStackParamList } from '../navigation/types'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>

function statusTone(erp: ErpTheme, status?: string): { bg: string; fg: string } {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('done')) return { bg: erp.successSoft, fg: erp.success }
  if (s.includes('progress') || s.includes('active')) return { bg: erp.primarySoft, fg: erp.primary }
  if (s.includes('hold') || s.includes('block')) return { bg: erp.warningSoft, fg: erp.warning }
  return { bg: erp.surfaceMuted, fg: erp.textMuted }
}

function StatCard({
  label,
  value,
  icon,
  tint,
  onPress
}: {
  label: string
  value: string | number
  icon: string
  tint: string
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <Pressable
      style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
      onPress={onPress}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tint}16` }]}>
        <FontAwesome5 name={icon as never} size={14} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  )
}

function QuickTile({
  icon,
  label,
  tint,
  onPress
}: {
  icon: string
  label: string
  tint: string
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  return (
    <Pressable
      style={({ pressed }) => [styles.quickTile, pressed && styles.quickTilePressed]}
      onPress={onPress}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${tint}14` }]}>
        <FontAwesome5 name={icon as never} size={18} color={tint} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  )
}

function ListRow({
  title,
  meta,
  badge,
  unread,
  dotColor,
  onPress
}: {
  title: string
  meta?: string
  badge?: string
  unread?: boolean
  dotColor?: string
  onPress: () => void
}) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const tone = statusTone(erp, badge)
  return (
    <Pressable
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
      onPress={onPress}
    >
      <View style={[styles.listDot, { backgroundColor: dotColor || erp.success }]} />
      <View style={styles.listContent}>
        <Text style={[styles.listTitle, unread && styles.listTitleUnread]} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.listMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>{badge}</Text>
        </View>
      ) : null}
      <FontAwesome5 name="chevron-right" size={11} color={erp.textSubtle} style={styles.listChevron} />
    </Pressable>
  )
}

function TaskRow({
  task,
  onPress
}: {
  task: DashboardTask
  onPress: () => void
}) {
  const title = task.title || task.name || 'Untitled task'
  const meta = [task.taskType === 'user' ? 'Personal' : task.projectName, task.status]
    .filter(Boolean)
    .join(' · ')
  return (
    <ListRow
      title={title}
      meta={meta || undefined}
      badge={task.status}
      onPress={onPress}
    />
  )
}

function NotificationRow({
  item,
  onPress
}: {
  item: DashboardNotification
  onPress: () => void
}) {
  const { erp } = useTheme()
  return (
    <ListRow
      title={item.title || item.message || 'Notification'}
      meta={item.title && item.message ? item.message : undefined}
      unread={!item.read}
      dotColor={item.read ? erp.textSubtle : erp.warning}
      onPress={onPress}
    />
  )
}

function JobCardRow({
  card,
  onPress
}: {
  card: DashboardJobCard
  onPress: () => void
}) {
  const { erp } = useTheme()
  return (
    <ListRow
      title={card.jobCardNumber || card.id}
      meta={[card.clientName, card.projectName].filter(Boolean).join(' · ') || card.agentName || '—'}
      badge={card.status}
      dotColor={erp.primary}
      onPress={onPress}
    />
  )
}

export function DashboardScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const widgetDefs = useMemo(() => getWidgetDefs(erp), [erp])
  const quickActionDefs = useMemo(() => getQuickActionDefs(erp), [erp])
  const { user, accessToken } = useAuth()
  const { unreadCount: notificationUnread, refresh: refreshNotificationUnread, decrementUnread } =
    useNotificationUnread()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [dashConfig, setDashConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG)
  const [projectTasks, setProjectTasks] = useState<DashboardTask[]>([])
  const [userTasks, setUserTasks] = useState<DashboardTask[]>([])
  const [notifications, setNotifications] = useState<DashboardNotification[]>([])
  const [jobCards, setJobCards] = useState<DashboardJobCard[]>([])
  const [stats, setStats] = useState({ projects: 0, activeProjects: 0, clients: 0 })

  const reloadConfig = useCallback(async () => {
    const cfg = await loadDashboardConfig()
    setDashConfig(cfg)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void reloadConfig()
    }, [reloadConfig])
  )

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')
      try {
        const [pt, ut, notes, cards, proj, clients] = await Promise.all([
          erpApi.getProjectTasks(accessToken).catch(() => []),
          erpApi.getUserTasks(accessToken).catch(() => []),
          erpApi.getNotifications(accessToken, 5).catch(() => []),
          erpApi.getRecentJobCards(accessToken, 5).catch(() => []),
          erpApi.getProjectsSummary(accessToken).catch(() => ({ total: 0, active: 0 })),
          erpApi.getClientsSummary(accessToken).catch(() => ({ total: 0 }))
        ])
        setProjectTasks(Array.isArray(pt) ? pt.slice(0, 6) : [])
        setUserTasks(Array.isArray(ut) ? ut.slice(0, 6) : [])
        setNotifications(Array.isArray(notes) ? notes : [])
        setJobCards(Array.isArray(cards) ? cards : [])
        setStats({
          projects: proj.total,
          activeProjects: proj.active,
          clients: clients.total
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load dashboard')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void load(true)
      void refreshNotificationUnread()
    }, [load, refreshNotificationUnread])
  )

  const handleNotificationPress = useCallback(
    (n: DashboardNotification) => {
      if (accessToken && n.id && !n.read) {
        void erpApi.markNotificationsRead(accessToken, [n.id]).then(() => {
          decrementUnread(1)
          void refreshNotificationUnread()
        })
      }
      openNotification(navigation, n)
    },
    [accessToken, decrementUnread, navigation, refreshNotificationUnread]
  )

  const combinedTasks = mergeDashboardTasks(userTasks, projectTasks).slice(0, 8)
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const widgetUnreadCount = notifications.filter((n) => !n.read).length
  const quickActions = visibleQuickActions(dashConfig)
  const widgets = visibleWidgets(dashConfig)

  const renderWidget = (id: DashboardWidgetId) => {
    const def = widgetDefs[id]
    const goToModule = () => openModule(navigation, def.screen)

    if (id === 'tasks') {
      return (
        <WidgetCard
          key={id}
          title={def.title}
          subtitle={def.subtitle}
          icon={def.icon}
          iconColor={def.iconColor}
          actionLabel="View all"
          onPressHeader={goToModule}
          onAction={goToModule}
        >
          {combinedTasks.length ? (
            combinedTasks.map((t) => (
              <TaskRow key={`${t.id}-${t.title}`} task={t} onPress={() => openTask(navigation, t)} />
            ))
          ) : (
            <Text style={styles.empty}>No open tasks — you're all caught up.</Text>
          )}
        </WidgetCard>
      )
    }

    if (id === 'notifications') {
      return (
        <WidgetCard
          key={id}
          title={def.title}
          subtitle={
            notificationUnread || widgetUnreadCount
              ? `${notificationUnread || widgetUnreadCount} unread`
              : def.subtitle
          }
          icon={def.icon}
          iconColor={def.iconColor}
          actionLabel="Open"
          onPressHeader={goToModule}
          onAction={goToModule}
        >
          {notifications.length ? (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onPress={() => handleNotificationPress(n)}
              />
            ))
          ) : (
            <Text style={styles.empty}>No recent notifications.</Text>
          )}
        </WidgetCard>
      )
    }

    return (
      <WidgetCard
        key={id}
        title={def.title}
        subtitle={def.subtitle}
        icon={def.icon}
        iconColor={def.iconColor}
        actionLabel="Open"
        onPressHeader={goToModule}
        onAction={goToModule}
      >
        {jobCards.length ? (
          jobCards.map((c) => (
            <JobCardRow key={c.id} card={c} onPress={() => openJobCard(navigation, c)} />
          ))
        ) : (
          <Text style={styles.empty}>No job cards yet — start one from Service & Maintenance.</Text>
        )}
      </WidgetCard>
    )
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Dashboard"
        subtitle="Here's what's happening today"
        navigation={navigation}
        onSettingsPress={() => navigation.navigate('Settings')}
      />
      <ScreenBody padded={false}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void load(true)
              }}
              tintColor={erp.primary}
            />
          }
        >
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcome}>Welcome back, {firstName}</Text>
                <Text style={styles.heroSub}>Your ERP at a glance — tap any card to jump in.</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.customizeBtn, pressed && styles.customizeBtnPressed]}
                onPress={() => navigation.navigate('DashboardCustomize')}
                hitSlop={8}
              >
                <FontAwesome5 name="sliders-h" size={13} color={erp.sidebarText} />
              </Pressable>
            </View>
          </View>

          {dashConfig.showStats ? (
            <View style={styles.statsRow}>
              <StatCard
                label="Projects"
                value={stats.projects}
                icon="project-diagram"
                tint="#7c3aed"
                onPress={() => navigation.navigate('Projects')}
              />
              <StatCard
                label="Active"
                value={stats.activeProjects}
                icon="bolt"
                tint={erp.success}
                onPress={() => navigation.navigate('Projects')}
              />
              <StatCard
                label="Clients"
                value={stats.clients}
                icon="users"
                tint={erp.primary}
                onPress={() => navigation.navigate('Clients')}
              />
            </View>
          ) : null}

          {quickActions.length ? (
            <View style={styles.quickSection}>
              <Text style={styles.quickHeading}>Quick access</Text>
              <View style={styles.quickGrid}>
                {quickActions.map((id) => {
                  const def = quickActionDefs[id]
                  return (
                    <QuickTile
                      key={id}
                      icon={def.icon}
                      label={def.label}
                      tint={def.tint}
                      onPress={() => openModule(navigation, def.screen)}
                    />
                  )
                })}
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={erp.primary} />
              <Text style={styles.loadingText}>Loading dashboard…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {widgets.length ? (
            <View style={styles.widgets}>
              {widgets.map((id) => renderWidget(id))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.empty}>All widgets are hidden.</Text>
              <Pressable onPress={() => navigation.navigate('DashboardCustomize')}>
                <Text style={styles.retry}>Customize dashboard</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  scroll: { paddingBottom: 36 },
  hero: {
    marginHorizontal: erp.space.lg,
    marginTop: erp.space.md,
    marginBottom: erp.space.sm,
    backgroundColor: erp.sidebar,
    borderRadius: erp.radius.xl,
    padding: erp.space.lg,
    ...erp.shadow
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  welcome: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4
  },
  heroSub: { fontSize: 14, color: erp.sidebarTextMuted, marginTop: 6, lineHeight: 20 },
  customizeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: erp.sidebarHover,
    alignItems: 'center',
    justifyContent: 'center'
  },
  customizeBtnPressed: { opacity: 0.85 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: erp.space.lg,
    paddingVertical: erp.space.sm
  },
  statCard: {
    flex: 1,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 12,
    alignItems: 'flex-start',
    ...erp.shadowSm
  },
  statCardPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: erp.textMuted, marginTop: 2, fontWeight: '600' },
  quickSection: { paddingHorizontal: erp.space.lg, paddingTop: erp.space.sm, paddingBottom: erp.space.md },
  quickHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: erp.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  quickTile: {
    width: '23%',
    minWidth: 76,
    flexGrow: 1,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    ...erp.shadowSm
  },
  quickTilePressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  quickLabel: { fontSize: 11, fontWeight: '700', color: erp.text, textAlign: 'center', lineHeight: 14 },
  loadingWrap: { alignItems: 'center', padding: 24, gap: 10 },
  loadingText: { color: erp.textMuted },
  errorBox: {
    marginHorizontal: erp.space.lg,
    backgroundColor: erp.dangerSoft,
    borderRadius: erp.radius.md,
    padding: 14,
    marginBottom: 12
  },
  errorText: { color: erp.danger, fontWeight: '600' },
  retry: { color: erp.primary, fontWeight: '700', marginTop: 8 },
  widgets: { paddingHorizontal: erp.space.lg, gap: 16, paddingTop: 4 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: erp.borderLight
  },
  listRowPressed: { backgroundColor: erp.surfaceMuted, marginHorizontal: -erp.space.md, paddingHorizontal: erp.space.md },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  listContent: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '600', color: erp.text },
  listTitleUnread: { fontWeight: '800' },
  listMeta: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
  listChevron: { marginLeft: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 90
  },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  empty: { color: erp.textMuted, fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  emptySection: { paddingHorizontal: erp.space.lg, paddingVertical: 24, alignItems: 'center', gap: 8 }
  })
}