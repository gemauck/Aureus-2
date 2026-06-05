import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { erp } from '../../theme/appTheme'
import type { RootStackParamList } from '../../navigation/types'
import { projectsApi } from '../api'
import { ProjectRow } from '../components/ProjectRow'
import { TaskRow } from '../components/TaskRow'
import type { ProjectsStackParamList } from '../navigation'
import type {
  ProjectFilterKey,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTask,
  ProjectsTab,
  TaskFilterStatus
} from '../types'
import {
  filterProjects,
  filterTasks,
  loadStarredIds,
  PROJECT_STATUSES,
  toggleStarred,
  uniqueClients
} from '../utils'

type Props = NativeStackScreenProps<ProjectsStackParamList, 'ProjectsHome'>

const FILTERS: { key: ProjectFilterKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'active', label: 'Active', icon: 'play-circle' },
  { key: 'starred', label: 'Starred', icon: 'star' }
]

const TASK_STATUS_FILTERS: TaskFilterStatus[] = [
  'all',
  'To Do',
  'In Progress',
  'Done',
  'Blocked'
]

export function ProjectsHomeScreen({ navigation }: Props) {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { accessToken } = useAuth()
  const [tab, setTab] = useState<ProjectsTab>('projects')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([])
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectFilterKey>('all')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskFilterStatus>('all')
  const [taskProjectFilter, setTaskProjectFilter] = useState('all')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setError('Please sign in again.')
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')
      try {
        const [p, t, starred] = await Promise.all([
          projectsApi.listProjects(accessToken, { includeTaskCount: true }),
          projectsApi.listAllTasks(accessToken),
          loadStarredIds()
        ])
        setProjects(p)
        setAllTasks(t)
        setStarredIds(starred)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load projects')
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

  const clients = useMemo(() => uniqueClients(projects), [projects])
  const filteredProjects = useMemo(
    () => filterProjects(projects, query, filter, statusFilter, clientFilter, starredIds),
    [projects, query, filter, statusFilter, clientFilter, starredIds]
  )
  const filteredTasks = useMemo(
    () => filterTasks(allTasks, query, taskStatusFilter, taskProjectFilter),
    [allTasks, query, taskStatusFilter, taskProjectFilter]
  )

  const activeCount = useMemo(
    () =>
      projects.filter((p) => {
        const st = String(p.status || '').toLowerCase()
        return st === 'active' || st === 'in progress'
      }).length,
    [projects]
  )

  const handleToggleStar = async (projectId: string) => {
    const next = await toggleStarred(projectId)
    setStarredIds(new Set(next))
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="Projects"
        subtitle="Active projects, tasks & trackers"
        showNotifications
        onNotificationsPress={() => rootNavigation.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.hero}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{projects.length}</Text>
              <Text style={styles.statLbl}>Projects</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{activeCount}</Text>
              <Text style={styles.statLbl}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{allTasks.length}</Text>
              <Text style={styles.statLbl}>Tasks</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['projects', 'tasks'] as ProjectsTab[]).map((key) => {
            const active = tab === key
            return (
              <Pressable
                key={key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setTab(key)}
              >
                <FontAwesome5
                  name={key === 'projects' ? 'folder' : 'check-square'}
                  size={14}
                  color={active ? '#fff' : erp.textMuted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key === 'projects' ? 'Projects' : 'All tasks'}
                </Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                    {key === 'projects' ? projects.length : allTasks.length}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.searchWrap}>
          <FontAwesome5 name="search" size={14} color={erp.textSubtle} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder={tab === 'projects' ? 'Search projects…' : 'Search tasks…'}
            placeholderTextColor={erp.textSubtle}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {tab === 'projects' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <Pressable
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <FontAwesome5
                    name={f.icon}
                    size={11}
                    color={active ? erp.primary : erp.textMuted}
                    solid={f.key === 'starred' && active}
                  />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              )
            })}
            <View style={styles.chipDivider} />
            {PROJECT_STATUSES.map((st) => {
              const active = statusFilter === st
              return (
                <Pressable
                  key={st}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {st === 'all' ? 'Any status' : st}
                  </Text>
                </Pressable>
              )
            })}
            {clients.length > 2 ? (
              <>
                <View style={styles.chipDivider} />
                {clients.slice(0, 8).map((c) => {
                  const id = typeof c === 'string' ? c : c.id
                  const label = typeof c === 'string' ? 'All clients' : c.name
                  const active = clientFilter === id
                  return (
                    <Pressable
                      key={id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setClientFilter(id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {label}
                      </Text>
                    </Pressable>
                  )
                })}
              </>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {TASK_STATUS_FILTERS.map((st) => {
              const active = taskStatusFilter === st
              return (
                <Pressable
                  key={st}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTaskStatusFilter(st)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {st === 'all' ? 'Any status' : st}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={erp.primary} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <FontAwesome5 name="exclamation-circle" size={28} color={erp.danger} />
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : tab === 'projects' ? (
          <FlatList
            data={filteredProjects}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
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
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <FontAwesome5 name="folder-open" size={32} color={erp.textSubtle} />
                <Text style={styles.emptyTitle}>No projects match</Text>
                <Text style={styles.emptySub}>Try clearing filters or pull to refresh.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ProjectRow
                project={item}
                starred={starredIds.has(item.id)}
                onToggleStar={() => void handleToggleStar(item.id)}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
              />
            )}
          />
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
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
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <FontAwesome5 name="check-square" size={32} color={erp.textSubtle} />
                <Text style={styles.emptyTitle}>No tasks match</Text>
                <Text style={styles.emptySub}>Try clearing filters or pull to refresh.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TaskRow
                task={item}
                showProject
                onPress={() =>
                  navigation.navigate('TaskDetail', {
                    taskId: item.id,
                    projectId: item.projectId || item.project?.id || '',
                    projectName: item.project?.name
                  })
                }
              />
            )}
          />
        )}
      </ScreenBody>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  hero: {
    marginHorizontal: erp.space.lg,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: erp.sidebar,
    borderRadius: erp.radius.lg,
    padding: 16,
    ...erp.shadowSm
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 12, color: erp.sidebarTextMuted, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.12)' },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: erp.space.lg,
    paddingTop: 12,
    paddingBottom: 8
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  tabBtnActive: { backgroundColor: erp.primary, borderColor: erp.primary },
  tabText: { fontWeight: '700', color: erp.textMuted, fontSize: 14 },
  tabTextActive: { color: '#fff' },
  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center'
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
  tabCountTextActive: { color: '#fff' },
  searchWrap: { paddingHorizontal: erp.space.lg, paddingBottom: 8, position: 'relative' },
  searchIcon: { position: 'absolute', left: 28, top: 15, zIndex: 1 },
  search: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingVertical: 12,
    paddingLeft: 38,
    paddingRight: 14,
    backgroundColor: erp.surface,
    fontSize: 16,
    color: erp.text
  },
  chipsRow: { paddingHorizontal: erp.space.lg, paddingBottom: 10, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  chipActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  chipTextActive: { color: erp.primary },
  chipDivider: { width: 1, height: 20, backgroundColor: erp.border, marginHorizontal: 4 },
  list: { paddingHorizontal: erp.space.lg, paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  loadingText: { color: erp.textMuted, fontWeight: '600' },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary
  },
  retryText: { color: '#fff', fontWeight: '800' },
  emptyWrap: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: erp.text },
  emptySub: { fontSize: 14, color: erp.textMuted, textAlign: 'center' }
})
