import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { openTask } from '../../dashboard/dashboardNavigation'
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheMyTasks,
  offlineListMessage,
  readCachedMyTasks
} from '../../offline/erpReadCaches'
import { erpApi, mergeDashboardTasks, type DashboardTask } from '../../services/erpApi'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import type { MyTasksStackParamList } from '../navigation'
import {
  formatDueLabel,
  isArchivedProjectTask,
  isUserTaskOverdue,
  normalizeUserTaskStatus,
  userTaskPriorityLabel,
  userTaskStatusLabel
} from '../utils'
import type { UserTaskStatusFilter } from '../types'

type Props = NativeStackScreenProps<MyTasksStackParamList, 'MyTasksHome'>

type TypeFilter = 'all' | 'user' | 'project'

const STATUS_FILTERS: { value: UserTaskStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'Active' },
  { value: 'completed', label: 'Done' }
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'user', label: 'Personal' },
  { value: 'project', label: 'Project' }
]

function statusTone(erp: ErpTheme, status?: string) {
  const s = normalizeUserTaskStatus(status)
  if (s === 'completed') return { bg: erp.successSoft, fg: erp.success }
  if (s === 'in-progress') return { bg: erp.primarySoft, fg: erp.primary }
  if (s === 'cancelled') return { bg: erp.surfaceMuted, fg: erp.textMuted }
  return { bg: erp.surfaceMuted, fg: erp.textMuted }
}

export function MyTasksHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [tasks, setTasks] = useState<DashboardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserTaskStatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')

      const applyCached = async () => {
        const cached = await readCachedMyTasks()
        if (cached?.length) {
          setTasks(cached)
          setError(offlineListMessage(true))
          return true
        }
        setTasks([])
        setError(offlineListMessage(false))
        return false
      }

      if (!isOnline) {
        await applyCached()
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        const [projectTasks, userTasks] = await Promise.all([
          erpApi.getProjectTasks(accessToken).catch(() => []),
          erpApi.getUserTasks(accessToken).catch(() => [])
        ])
        const merged = mergeDashboardTasks(userTasks, projectTasks)
        setTasks(merged)
        await cacheMyTasks(merged)
      } catch (e) {
        const hadCache = await applyCached()
        if (!hadCache) {
          setError(e instanceof Error ? e.message : 'Could not load tasks')
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, isOnline]
  )

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (isArchivedProjectTask(task.status)) return false
      if (typeFilter === 'user' && task.taskType !== 'user') return false
      if (typeFilter === 'project' && task.taskType !== 'project') return false
      if (statusFilter !== 'all') {
        const st = normalizeUserTaskStatus(task.status)
        if (st !== statusFilter) return false
      }
      if (!q) return true
      const hay = `${task.title || ''} ${task.name || ''} ${task.projectName || ''} ${task.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [tasks, query, statusFilter, typeFilter])

  const onCreate = () => {
    navigation.navigate('UserTaskDetail', { taskId: 'new', isNew: true })
  }

  const listHeader = (
    <View style={styles.toolbar}>
      <TextInput
        style={styles.search}
        placeholder="Search tasks…"
        value={query}
        onChangeText={setQuery}
        placeholderTextColor={erp.textSubtle}
      />

      <Text style={styles.filterLabel}>Type</Text>
      <View style={styles.filterRow}>
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.value
          return (
            <Pressable
              key={f.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setTypeFilter(f.value)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.filterLabel}>Status</Text>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value
          return (
            <Pressable
              key={f.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.resultCount}>
        {filtered.length} task{filtered.length === 1 ? '' : 's'}
      </Text>
    </View>
  )

  return (
    <View style={styles.root}>
      <AppHeader
        title="My Tasks"
        subtitle="Project tasks and personal to-dos"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={erp.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => `${item.taskType}-${item.id}`}
          stickyHeaderIndices={[0]}
          ListHeaderComponent={listHeader}
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
            <Text style={styles.empty}>No tasks match your filters.</Text>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TaskListRow task={item} onPress={() => openTask(navigation.getParent(), item)} />
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={onCreate}>
        <FontAwesome5 name="plus" size={20} color="#fff" />
      </Pressable>
    </View>
  )
}

function TaskListRow({ task, onPress }: { task: DashboardTask; onPress: () => void }) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const title = task.title || task.name || 'Untitled task'
  const overdue = isUserTaskOverdue(task)
  const dueLabel = formatDueLabel(task.dueDate)
  const completed = normalizeUserTaskStatus(task.status) === 'completed'
  const tone = statusTone(erp, task.status)

  const metaParts = [
    task.taskType === 'user' ? 'Personal' : task.projectName,
    task.priority ? userTaskPriorityLabel(task.priority) : null,
    dueLabel
  ].filter(Boolean)

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={[styles.rowDot, { backgroundColor: task.taskType === 'user' ? erp.primary : '#6366f1' }]} />
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, completed && styles.rowTitleDone]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {metaParts.length ? (
          <Text
            style={[styles.rowMeta, overdue && styles.rowMetaOverdue]}
            numberOfLines={1}
          >
            {metaParts.join(' · ')}
          </Text>
        ) : null}
      </View>
      {task.status ? (
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusText, { color: tone.fg }]} numberOfLines={1}>
            {userTaskStatusLabel(task.status)}
          </Text>
        </View>
      ) : null}
      <FontAwesome5 name="chevron-right" size={10} color={erp.textSubtle} />
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    list: { flex: 1 },
    toolbar: {
      backgroundColor: erp.surface,
      borderBottomWidth: 1,
      borderBottomColor: erp.border,
      paddingHorizontal: erp.space.lg,
      paddingTop: 10,
      paddingBottom: 10,
      gap: 6
    },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: erp.bg,
      fontSize: 15,
      color: erp.text
    },
    filterLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: erp.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 2
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.bg
    },
    filterChipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    filterText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
    filterTextActive: { color: '#fff' },
    resultCount: {
      fontSize: 12,
      fontWeight: '600',
      color: erp.textSubtle,
      marginTop: 2
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: erp.space.lg,
      backgroundColor: erp.bg,
      minHeight: 52
    },
    rowPressed: { backgroundColor: erp.surfaceMuted },
    rowDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 14, fontWeight: '600', color: erp.text },
    rowTitleDone: { textDecorationLine: 'line-through', opacity: 0.65 },
    rowMeta: { fontSize: 11, color: erp.textMuted, marginTop: 2, fontWeight: '500' },
    rowMetaOverdue: { color: erp.danger, fontWeight: '700' },
    statusPill: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 999,
      maxWidth: 72,
      flexShrink: 0
    },
    statusText: { fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: erp.borderLight,
      marginLeft: erp.space.lg + 14
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    error: { color: erp.danger, fontWeight: '600', textAlign: 'center' },
    retry: { color: erp.primary, fontWeight: '700' },
    empty: {
      textAlign: 'center',
      color: erp.textMuted,
      paddingHorizontal: erp.space.lg,
      paddingVertical: 28,
      fontSize: 14
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: erp.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...erp.shadow
    }
  })
}
