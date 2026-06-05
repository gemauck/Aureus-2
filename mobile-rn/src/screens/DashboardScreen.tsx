import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../components/shell/AppHeader'
import { ScreenBody } from '../components/shell/ScreenBody'
import { WidgetCard } from '../components/dashboard/WidgetCard'
import { erpApi, type DashboardJobCard, type DashboardNotification, type DashboardTask } from '../services/erpApi'
import { useAuth } from '../state/AuthContext'
import { erp } from '../theme/appTheme'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>

function StatPill({ label, value, tint }: { label: string; value: string | number; tint: string }) {
  return (
    <View style={[styles.statPill, { backgroundColor: `${tint}12` }]}>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function TaskRow({ task }: { task: DashboardTask }) {
  const title = task.title || task.name || 'Untitled task'
  return (
    <View style={styles.row}>
      <View style={styles.rowDot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {task.projectName ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {task.projectName}
          </Text>
        ) : null}
      </View>
      {task.status ? <Text style={styles.rowBadge}>{task.status}</Text> : null}
    </View>
  )
}

function NotificationRow({ item }: { item: DashboardNotification }) {
  return (
    <View style={styles.row}>
      <FontAwesome5
        name={item.read ? 'bell' : 'bell'}
        size={14}
        color={item.read ? erp.textSubtle : erp.primary}
        style={{ width: 20, marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, !item.read && styles.unreadTitle]} numberOfLines={2}>
          {item.title || item.message || 'Notification'}
        </Text>
        {item.message && item.title ? (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {item.message}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function JobCardRow({ card }: { card: DashboardJobCard }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowDot, { backgroundColor: erp.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {card.jobCardNumber || card.id}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[card.clientName, card.projectName].filter(Boolean).join(' · ') || card.agentName || '—'}
        </Text>
      </View>
      {card.status ? <Text style={styles.rowBadge}>{card.status}</Text> : null}
    </View>
  )
}

export function DashboardScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [projectTasks, setProjectTasks] = useState<DashboardTask[]>([])
  const [userTasks, setUserTasks] = useState<DashboardTask[]>([])
  const [notifications, setNotifications] = useState<DashboardNotification[]>([])
  const [jobCards, setJobCards] = useState<DashboardJobCard[]>([])
  const [stats, setStats] = useState({ projects: 0, activeProjects: 0, clients: 0 })

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

  const combinedTasks = [...userTasks, ...projectTasks].slice(0, 8)
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <View style={styles.root}>
      <AppHeader
        title="Dashboard"
        subtitle="Here's what's happening today"
        onNotificationsPress={() => navigation.navigate('Notifications')}
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
            <Text style={styles.welcome}>Welcome, {firstName}</Text>
            <Text style={styles.heroSub}>Your ERP at a glance — same modules as the web app.</Text>
          </View>

          <View style={styles.statsRow}>
            <StatPill label="Projects" value={stats.projects} tint={erp.primary} />
            <StatPill label="Active" value={stats.activeProjects} tint={erp.success} />
            <StatPill label="Clients" value={stats.clients} tint="#7c3aed" />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            <QuickAction
              icon="wrench"
              label="Job cards"
              tint={erp.primary}
              onPress={() => navigation.navigate('JobCards')}
            />
            <QuickAction icon="project-diagram" label="Projects" tint="#7c3aed" onPress={() => navigation.navigate('Projects')} />
            <QuickAction icon="users" label="CRM" tint="#0891b2" onPress={() => navigation.navigate('Clients')} />
            <QuickAction icon="check-square" label="My tasks" tint={erp.success} onPress={() => navigation.navigate('MyTasks')} />
          </ScrollView>

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

          <View style={styles.widgets}>
            <WidgetCard
              title="My Tasks"
              subtitle="Project tasks and personal to-dos"
              icon="check-square"
              iconColor={erp.success}
              actionLabel="View all"
              onAction={() => navigation.navigate('MyTasks')}
            >
              {combinedTasks.length ? (
                combinedTasks.map((t) => <TaskRow key={`${t.id}-${t.title}`} task={t} />)
              ) : (
                <Text style={styles.empty}>No open tasks — you're all caught up.</Text>
              )}
            </WidgetCard>

            <WidgetCard
              title="Notifications"
              subtitle={unreadCount ? `${unreadCount} unread` : 'All caught up'}
              icon="bell"
              iconColor={erp.warning}
              actionLabel="Open"
              onAction={() => navigation.navigate('Notifications')}
            >
              {notifications.length ? (
                notifications.map((n) => <NotificationRow key={n.id} item={n} />)
              ) : (
                <Text style={styles.empty}>No recent notifications.</Text>
              )}
            </WidgetCard>

            <WidgetCard
              title="Recent job cards"
              subtitle="Latest field service visits"
              icon="clipboard-list"
              iconColor={erp.primary}
              actionLabel="Job cards"
              onAction={() => navigation.navigate('JobCards')}
            >
              {jobCards.length ? (
                jobCards.map((c) => <JobCardRow key={c.id} card={c} />)
              ) : (
                <Text style={styles.empty}>No job cards yet — start one from Service & Maintenance.</Text>
              )}
            </WidgetCard>
          </View>
        </ScrollView>
      </ScreenBody>
    </View>
  )
}

function QuickAction({
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
  return (
    <Pressable style={[styles.quickAction, { borderColor: `${tint}30` }]} onPress={onPress}>
      <View style={[styles.quickIcon, { backgroundColor: `${tint}15` }]}>
        <FontAwesome5 name={icon as never} size={16} color={tint} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  scroll: { paddingBottom: 32 },
  hero: { paddingHorizontal: erp.space.lg, paddingTop: erp.space.lg, paddingBottom: erp.space.sm },
  welcome: { fontSize: 26, fontWeight: '800', color: erp.text, letterSpacing: -0.5 },
  heroSub: { fontSize: 14, color: erp.textMuted, marginTop: 6, lineHeight: 20 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: erp.space.lg,
    paddingVertical: erp.space.sm
  },
  statPill: {
    flex: 1,
    borderRadius: erp.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: erp.textMuted, marginTop: 2, fontWeight: '600' },
  quickRow: { paddingHorizontal: erp.space.lg, gap: 10, paddingBottom: erp.space.md },
  quickAction: {
    width: 96,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    ...erp.shadowSm
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: erp.text, textAlign: 'center' },
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
  widgets: { paddingHorizontal: erp.space.lg, gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: erp.borderLight
  },
  rowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: erp.success, marginTop: 6 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: erp.text },
  unreadTitle: { fontWeight: '800' },
  rowMeta: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
  rowBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: erp.textMuted,
    backgroundColor: erp.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden'
  },
  empty: { color: erp.textMuted, fontSize: 14, lineHeight: 20 }
})
