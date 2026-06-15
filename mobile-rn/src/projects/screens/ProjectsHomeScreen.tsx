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
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheProjectsList,
  cacheProjectTasksList,
  offlineListMessage,
  readCachedProjectsList,
  readCachedProjectTasksList
} from '../../offline/erpReadCaches'
import { useAuth } from '../../state/AuthContext'

import type { RootStackParamList } from '../../navigation/types'
import { projectsApi } from '../api'
import { ProjectInsightsBar } from '../components/ProjectInsightsBar'
import { ProjectRow } from '../components/ProjectRow'
import { TaskRow } from '../components/TaskRow'
import type { ProjectsStackParamList } from '../navigation'
import type {
  ProjectFilterKey,
  ProjectListView,
  ProjectSortKey,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTask,
  ProjectsTab,
  TaskFilterStatus,
  TaskScopeFilter
} from '../types'
import {
  computeInsights,
  filterProjects,
  filterTasks,
  groupProjectsByClient,
  loadStarredIds,
  PROJECT_STATUSES,
  sortProjects,
  toggleStarred,
  uniqueClients,
  uniqueTaskProjects
} from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

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
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const [tab, setTab] = useState<ProjectsTab>('projects')
  const [listView, setListView] = useState<ProjectListView>('list')
  const [sortKey, setSortKey] = useState<ProjectSortKey>('name')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([])
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectFilterKey>('all')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskFilterStatus>('all')
  const [taskProjectFilter, setTaskProjectFilter] = useState('all')
  const [taskScope, setTaskScope] = useState<TaskScopeFilter>('all')

  const loadProjects = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setError('Please sign in again.')
        setProjectsLoading(false)
        return
      }
      if (!silent) setProjectsLoading(true)
      setError('')

      const applyCached = async () => {
        const cached = await readCachedProjectsList()
        const starred = await loadStarredIds()
        setStarredIds(starred)
        if (cached?.length) {
          setProjects(cached)
          return true
        }
        setProjects([])
        setError(offlineListMessage(false))
        return false
      }

      if (!isOnline) {
        await applyCached()
        setProjectsLoading(false)
        return
      }

      try {
        const [p, starred] = await Promise.all([
          projectsApi.listProjects(accessToken),
          loadStarredIds()
        ])
        setProjects(p)
        setStarredIds(starred)
        await cacheProjectsList(p)
      } catch (e) {
        const hadCache = await applyCached()
        if (!hadCache) {
          setError(e instanceof Error ? e.message : 'Could not load projects')
        }
      } finally {
        setProjectsLoading(false)
      }
    },
    [accessToken, isOnline]
  )

  const loadTasks = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setTasksLoading(true)

      const applyCached = async () => {
        const cached = await readCachedProjectTasksList()
        if (cached?.length) {
          setAllTasks(cached)
          setTasksLoaded(true)
          return true
        }
        return false
      }

      if (!isOnline) {
        await applyCached()
        setTasksLoading(false)
        return
      }

      try {
        const t = await projectsApi.listAllTasks(accessToken)
        setAllTasks(t)
        setTasksLoaded(true)
        await cacheProjectTasksList(t)
      } catch (e) {
        const hadCache = await applyCached()
        if (!hadCache && !silent) {
          setError(e instanceof Error ? e.message : 'Could not load tasks')
        }
      } finally {
        setTasksLoading(false)
      }
    },
    [accessToken, isOnline]
  )

  const refreshAll = useCallback(
    async (silent = false) => {
      try {
        await Promise.all([
          loadProjects(silent),
          ...(tasksLoaded || tab === 'tasks' ? [loadTasks(silent)] : [])
        ])
      } finally {
        setRefreshing(false)
      }
    },
    [loadProjects, loadTasks, tasksLoaded, tab]
  )

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (tab === 'tasks' && !tasksLoaded && !tasksLoading) {
      void loadTasks()
    }
  }, [tab, tasksLoaded, tasksLoading, loadTasks])

  const clients = useMemo(() => uniqueClients(projects), [projects])
  const filteredProjects = useMemo(
    () =>
      sortProjects(
        filterProjects(projects, query, filter, statusFilter, clientFilter, starredIds),
        sortKey
      ),
    [projects, query, filter, statusFilter, clientFilter, starredIds, sortKey]
  )
  const clientGroups = useMemo(() => groupProjectsByClient(filteredProjects), [filteredProjects])
  const filteredTasks = useMemo(
    () =>
      filterTasks(
        allTasks,
        query,
        taskStatusFilter,
        taskProjectFilter,
        taskScope,
        user?.id
      ),
    [allTasks, query, taskStatusFilter, taskProjectFilter, taskScope, user?.id]
  )
  const insights = useMemo(
    () => computeInsights(projects, allTasks, starredIds, user?.id),
    [projects, allTasks, starredIds, user?.id]
  )
  const taskProjects = useMemo(() => uniqueTaskProjects(allTasks), [allTasks])

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
        {tab === 'tasks' ? (
          <ProjectInsightsBar
            insights={insights}
            taskScope={taskScope}
            onScopePress={(scope) => {
              setTab('tasks')
              setTaskScope((prev) => (prev === scope ? 'all' : scope))
            }}
          />
        ) : null}

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
                    {key === 'projects'
                      ? projects.length
                      : tasksLoaded
                        ? allTasks.length
                        : '…'}
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
          <>
            <View style={styles.viewToggleRow}>
              <Pressable
                style={[styles.viewToggle, listView === 'list' && styles.viewToggleActive]}
                onPress={() => setListView('list')}
              >
                <FontAwesome5 name="list" size={12} color={listView === 'list' ? erp.primary : erp.textMuted} />
                <Text style={[styles.viewToggleText, listView === 'list' && styles.viewToggleTextActive]}>
                  List
                </Text>
              </Pressable>
              <Pressable
                style={[styles.viewToggle, listView === 'client' && styles.viewToggleActive]}
                onPress={() => setListView('client')}
              >
                <FontAwesome5 name="building" size={12} color={listView === 'client' ? erp.primary : erp.textMuted} />
                <Text style={[styles.viewToggleText, listView === 'client' && styles.viewToggleTextActive]}>
                  By client
                </Text>
              </Pressable>
              <Pressable
                style={styles.sortBtn}
                onPress={() => {
                  const order: ProjectSortKey[] = ['name', 'client', 'updated', 'due']
                  const idx = order.indexOf(sortKey)
                  setSortKey(order[(idx + 1) % order.length])
                }}
              >
                <FontAwesome5 name="sort" size={12} color={erp.textMuted} />
                <Text style={styles.sortBtnText}>Sort: {sortKey}</Text>
              </Pressable>
            </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <Pressable
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(active ? 'all' : f.key)}
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
                  onPress={() => setStatusFilter(active ? 'all' : st)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {st === 'all' ? 'Any status' : st}
                  </Text>
                </Pressable>
              )
            })}
            {clients.length > 1 ? (
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
                      onPress={() => setClientFilter(active ? 'all' : id)}
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
          </>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            {(
              [
                { key: 'all' as TaskScopeFilter, label: 'All tasks' },
                { key: 'mine' as TaskScopeFilter, label: 'Assigned to me' },
                { key: 'overdue' as TaskScopeFilter, label: 'Overdue' },
                { key: 'dueSoon' as TaskScopeFilter, label: 'Due soon' }
              ] as const
            ).map((s) => {
              const active = taskScope === s.key
              return (
                <Pressable
                  key={s.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTaskScope(s.key)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
                </Pressable>
              )
            })}
            <View style={styles.chipDivider} />
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
            {taskProjects.length > 0 ? (
              <>
                <View style={styles.chipDivider} />
                <Pressable
                  style={[styles.chip, taskProjectFilter === 'all' && styles.chipActive]}
                  onPress={() => setTaskProjectFilter('all')}
                >
                  <Text
                    style={[
                      styles.chipText,
                      taskProjectFilter === 'all' && styles.chipTextActive
                    ]}
                  >
                    All projects
                  </Text>
                </Pressable>
                {taskProjects.slice(0, 10).map((p) => {
                  const active = taskProjectFilter === p.id
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTaskProjectFilter(active ? 'all' : p.id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </>
            ) : null}
          </ScrollView>
        )}

        {(tab === 'projects' ? projectsLoading : projectsLoading || tasksLoading) && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={erp.primary} />
            <Text style={styles.loadingText}>
              {tab === 'projects' ? 'Loading projects…' : 'Loading tasks…'}
            </Text>
          </View>
        ) : error && (tab === 'projects' ? projects.length === 0 : allTasks.length === 0) ? (
          <View style={styles.center}>
            <FontAwesome5 name="exclamation-circle" size={28} color={erp.danger} />
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void refreshAll()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : tab === 'projects' ? (
          listView === 'client' ? (
            <FlatList
              data={clientGroups}
              keyExtractor={(g) => g.clientKey}
              style={styles.listBody}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true)
                    void refreshAll(true)
                  }}
                  tintColor={erp.primary}
                />
              }
              initialNumToRender={16}
              maxToRenderPerBatch={12}
              windowSize={8}
              removeClippedSubviews
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <FontAwesome5 name="folder-open" size={32} color={erp.textSubtle} />
                  <Text style={styles.emptyTitle}>No projects match</Text>
                </View>
              }
              renderItem={({ item: group }) => (
                <View style={styles.clientGroup}>
                  <View style={styles.clientHeader}>
                    <FontAwesome5 name="building" size={14} color={erp.primary} />
                    <Text style={styles.clientName}>{group.clientName}</Text>
                    <Text style={styles.clientCount}>{group.projects.length}</Text>
                  </View>
                  {group.projects.map((item) => (
                    <ProjectRow
                      key={item.id}
                      project={item}
                      starred={starredIds.has(item.id)}
                      onToggleStar={() => void handleToggleStar(item.id)}
                      onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
                    />
                  ))}
                </View>
              )}
            />
          ) : (
          <FlatList
            data={filteredProjects}
            keyExtractor={(item) => item.id}
            style={styles.listBody}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void refreshAll(true)
                }}
                tintColor={erp.primary}
              />
            }
            initialNumToRender={20}
            maxToRenderPerBatch={16}
            windowSize={8}
            removeClippedSubviews
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
          )
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            style={styles.listBody}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void refreshAll(true)
                }}
                tintColor={erp.primary}
              />
            }
            initialNumToRender={20}
            maxToRenderPerBatch={16}
            windowSize={8}
            removeClippedSubviews
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

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
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
  chipsScroll: { flexGrow: 0, minHeight: 44 },
  chipsRow: { paddingHorizontal: erp.space.lg, paddingBottom: 10, gap: 8, alignItems: 'center' },
  listBody: { flex: 1 },
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
  emptySub: { fontSize: 14, color: erp.textMuted, textAlign: 'center' },
  viewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: erp.space.lg,
    paddingBottom: 8
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  viewToggleActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
  viewToggleText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  viewToggleTextActive: { color: erp.primary },
  sortBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  sortBtnText: { fontSize: 11, fontWeight: '700', color: erp.textMuted, textTransform: 'capitalize' },
  clientGroup: { marginBottom: 10 },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  clientName: { flex: 1, fontSize: 15, fontWeight: '800', color: erp.text },
  clientCount: { fontSize: 12, fontWeight: '700', color: erp.textMuted }
  })
}