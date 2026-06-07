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
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { openTask } from '../../dashboard/dashboardNavigation'
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

const STATUS_FILTERS: { value: UserTaskStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Done' }
]

export function MyTasksHomeScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [tasks, setTasks] = useState<DashboardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserTaskStatusFilter>('all')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      setError('')
      try {
        const [projectTasks, userTasks] = await Promise.all([
          erpApi.getProjectTasks(accessToken).catch(() => []),
          erpApi.getUserTasks(accessToken).catch(() => [])
        ])
        setTasks(mergeDashboardTasks(userTasks, projectTasks))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load tasks')
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (isArchivedProjectTask(task.status)) return false
      if (statusFilter !== 'all') {
        const st = normalizeUserTaskStatus(task.status)
        if (st !== statusFilter) return false
      }
      if (!q) return true
      const hay = `${task.title || ''} ${task.name || ''} ${task.projectName || ''} ${task.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [tasks, query, statusFilter])

  const onCreate = () => {
    navigation.navigate('UserTaskDetail', { taskId: 'new', isNew: true })
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="My Tasks"
        subtitle="Project tasks and personal to-dos"
        onNotificationsPress={() => navigation.getParent()?.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Search tasks…"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={erp.textSubtle}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
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
        </ScrollView>

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
            data={filtered}
            keyExtractor={(item) => `${item.taskType}-${item.id}`}
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
            ListEmptyComponent={<Text style={styles.empty}>No tasks match your filters.</Text>}
            renderItem={({ item }) => (
              <TaskCard task={item} onPress={() => openTask(navigation.getParent(), item)} />
            )}
          />
        )}
      </ScreenBody>

      <Pressable style={styles.fab} onPress={onCreate}>
        <FontAwesome5 name="plus" size={20} color="#fff" />
      </Pressable>
    </View>
  )
}

function TaskCard({ task, onPress }: { task: DashboardTask; onPress: () => void }) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const title = task.title || task.name || 'Untitled task'
  const overdue = isUserTaskOverdue(task)
  const dueLabel = formatDueLabel(task.dueDate)
  const isUser = task.taskType === 'user'

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.typeBadge, isUser ? styles.typeBadgeUser : styles.typeBadgeProject]}>
          <Text style={styles.typeBadgeText}>{isUser ? 'Personal' : 'Project'}</Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        {task.projectName ? <Text style={styles.metaText}>{task.projectName}</Text> : null}
        {task.status ? (
          <Text style={styles.metaText}>{userTaskStatusLabel(task.status)}</Text>
        ) : null}
        {task.priority ? (
          <Text style={styles.metaText}>{userTaskPriorityLabel(task.priority)}</Text>
        ) : null}
      </View>
      {dueLabel ? (
        <Text style={[styles.dueText, overdue && { color: erp.danger, fontWeight: '700' }]}>
          {dueLabel}
        </Text>
      ) : null}
    </Pressable>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    searchWrap: { paddingHorizontal: erp.space.lg, paddingTop: 8, paddingBottom: 4 },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: erp.surface,
      fontSize: 16,
      color: erp.text
    },
    filters: { paddingHorizontal: erp.space.lg, paddingBottom: 8, gap: 8 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    filterChipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: erp.textMuted },
    filterTextActive: { color: '#fff' },
    list: { paddingHorizontal: erp.space.lg, paddingBottom: 88, gap: 10 },
    card: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: erp.border,
      marginBottom: 10,
      ...erp.shadowSm
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: erp.text },
    typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    typeBadgeUser: { backgroundColor: '#dbeafe' },
    typeBadgeProject: { backgroundColor: '#e0e7ff' },
    typeBadgeText: { fontSize: 10, fontWeight: '800', color: '#1e40af' },
    cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    metaText: { fontSize: 12, color: erp.textMuted, fontWeight: '600' },
    dueText: { fontSize: 12, color: erp.textSubtle, marginTop: 6, fontWeight: '600' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    error: { color: erp.danger, fontWeight: '600', textAlign: 'center' },
    retry: { color: erp.primary, fontWeight: '700' },
    empty: { textAlign: 'center', color: erp.textMuted, padding: 32, fontSize: 15 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: erp.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...erp.shadow
    }
  })
}
