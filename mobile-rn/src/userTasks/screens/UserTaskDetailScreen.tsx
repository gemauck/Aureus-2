import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  DateTimeField,
  parseFieldDate,
  toDateLocal
} from '../../jobcards/components/DateTimeField'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheEntityDetail,
  readEntityDetail,
  userTaskDetailCacheKey
} from '../../offline/entityDetailCache'
import { offlineListMessage } from '../../offline/erpReadCaches'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { userTasksApi } from '../api'
import type { MyTasksStackParamList } from '../navigation'
import type { UserTask, UserTaskChecklistItem, UserTaskList, UserTaskTag } from '../types'
import {
  normalizeUserTaskStatus,
  USER_TASK_PRIORITIES,
  USER_TASK_STATUSES
} from '../utils'

type Props = NativeStackScreenProps<MyTasksStackParamList, 'UserTaskDetail'>

function dueDateFieldValue(iso?: string | null): string {
  if (!iso) return ''
  return toDateLocal(parseFieldDate(iso, 'date'))
}

export function UserTaskDetailScreen({ route, navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { taskId, isNew } = route.params
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [readOnlyOffline, setReadOnlyOffline] = useState(false)
  const [task, setTask] = useState<UserTask | null>(null)
  const [lists, setLists] = useState<UserTaskList[]>([])
  const [tags, setTags] = useState<UserTaskTag[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [newChecklistText, setNewChecklistText] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const loadMeta = useCallback(async () => {
    if (!accessToken) return
    const [l, t] = await Promise.all([
      userTasksApi.listLists(accessToken).catch(() => []),
      userTasksApi.listTags(accessToken).catch(() => [])
    ])
    setLists(l)
    setTags(t)
  }, [accessToken])

  const load = useCallback(async () => {
    if (!accessToken || isNew) {
      setTask({
        id: 'new',
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        checklist: []
      })
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    setReadOnlyOffline(false)

    const applyCached = async () => {
      const cached = await readEntityDetail<UserTask>(userTaskDetailCacheKey(taskId))
      if (cached) {
        setTask(cached)
        setTitleDraft(cached.title || '')
        setDescDraft(cached.description || '')
        setCategoryDraft(cached.category || '')
        setSelectedTagIds((cached.tags || []).map((tag) => tag.id))
        setReadOnlyOffline(true)
        return true
      }
      setError(offlineListMessage(false))
      return false
    }

    if (!isOnline) {
      await applyCached()
      setLoading(false)
      return
    }

    try {
      const t = await userTasksApi.getTask(accessToken, taskId)
      setTask(t)
      setTitleDraft(t.title || '')
      setDescDraft(t.description || '')
      setCategoryDraft(t.category || '')
      setSelectedTagIds((t.tags || []).map((tag) => tag.id))
      await cacheEntityDetail(userTaskDetailCacheKey(taskId), t)
    } catch (e) {
      const hadCache = await applyCached()
      if (!hadCache) {
        setError(e instanceof Error ? e.message : 'Could not load task')
      }
    } finally {
      setLoading(false)
    }
  }, [accessToken, isNew, isOnline, taskId])

  useEffect(() => {
    void loadMeta()
    void load()
  }, [load, loadMeta])

  const saveTask = async (body: Record<string, unknown>, opts?: { navigateBack?: boolean }) => {
    if (!accessToken || readOnlyOffline) return
    setSaving(true)
    setError('')
    try {
      if (isNew || taskId === 'new') {
        const title = String(body.title ?? titleDraft).trim()
        if (!title) {
          setError('Title is required')
          return
        }
        const created = await userTasksApi.createTask(accessToken, {
          title,
          description: body.description ?? descDraft,
          status: body.status ?? 'todo',
          priority: body.priority ?? 'medium',
          category: body.category ?? categoryDraft,
          dueDate: body.dueDate,
          listId: body.listId,
          checklist: body.checklist ?? [],
          tagIds: body.tagIds ?? selectedTagIds
        })
        if (opts?.navigateBack) {
          navigation.replace('UserTaskDetail', { taskId: created.id })
        } else {
          navigation.goBack()
        }
        return
      }
      const updated = await userTasksApi.updateTask(accessToken, taskId, body)
      setTask(updated)
      setSelectedTagIds((updated.tags || []).map((tag) => tag.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const patchTask = async (body: Record<string, unknown>) => {
    if (readOnlyOffline) return
    if (isNew || taskId === 'new') {
      setTask((prev) => (prev ? ({ ...prev, ...body } as UserTask) : prev))
      return
    }
    setTask((prev) => (prev ? ({ ...prev, ...body } as UserTask) : prev))
    setSaving(true)
    setError('')
    try {
      const updated = await userTasksApi.updateTask(accessToken!, taskId, body)
      setTask(updated)
      setSelectedTagIds((updated.tags || []).map((tag) => tag.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      void load()
    } finally {
      setSaving(false)
    }
  }

  const saveFields = async () => {
    const title = titleDraft.trim()
    if (!title) {
      setError('Title is required')
      return
    }
    await saveTask({
      title,
      description: descDraft,
      category: categoryDraft,
      tagIds: selectedTagIds
    })
  }

  const toggleComplete = async () => {
    if (!task) return
    const st = normalizeUserTaskStatus(task.status)
    const next = st === 'completed' ? 'todo' : 'completed'
    await patchTask({ status: next })
  }

  const toggleTag = async (tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
    setSelectedTagIds(next)
    if (!isNew && taskId !== 'new') {
      await saveTask({ tagIds: next })
    }
  }

  const toggleChecklistItem = async (idx: number) => {
    if (!task?.checklist) return
    const next: UserTaskChecklistItem[] = task.checklist.map((item, i) =>
      i === idx ? { ...item, completed: !item.completed } : item
    )
    setTask((prev) => (prev ? { ...prev, checklist: next } : prev))
    await patchTask({ checklist: next })
  }

  const addChecklistItem = async () => {
    if (!task || !newChecklistText.trim()) return
    const next: UserTaskChecklistItem[] = [
      ...(task.checklist || []),
      { id: `cl-${Date.now()}`, text: newChecklistText.trim(), completed: false }
    ]
    setNewChecklistText('')
    setTask((prev) => (prev ? { ...prev, checklist: next } : prev))
    await patchTask({ checklist: next })
  }

  const removeChecklistItem = async (idx: number) => {
    if (!task?.checklist) return
    const next = task.checklist.filter((_, i) => i !== idx)
    setTask((prev) => (prev ? { ...prev, checklist: next } : prev))
    await patchTask({ checklist: next })
  }

  const confirmDelete = () => {
    Alert.alert('Delete task', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteTask() }
    ])
  }

  const deleteTask = async () => {
    if (!accessToken || isNew || taskId === 'new') {
      navigation.goBack()
      return
    }
    setSaving(true)
    try {
      await userTasksApi.deleteTask(accessToken, taskId)
      navigation.goBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
      </View>
    )
  }

  if (error && !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (!task) return null

  const checklist = task.checklist || []
  const completed = normalizeUserTaskStatus(task.status) === 'completed'

  return (
    <View style={styles.root}>
      <OfflineBanner visible={readOnlyOffline} variant="read" />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>My Tasks</Text>
        </Pressable>
        <TextInput
          style={[styles.titleInput, completed && styles.titleCompleted]}
          value={titleDraft}
          onChangeText={setTitleDraft}
          placeholder="Task title"
          placeholderTextColor={erp.textSubtle}
        />
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => void toggleComplete()} disabled={saving}>
            <FontAwesome5
              name="check-circle"
              size={20}
              color={completed ? '#16a34a' : erp.textSubtle}
            />
          </Pressable>
          {!isNew && taskId !== 'new' ? (
            <Pressable style={styles.iconBtn} onPress={confirmDelete} disabled={saving}>
              <FontAwesome5 name="trash-alt" size={16} color={erp.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {USER_TASK_STATUSES.map((st) => {
              const active = normalizeUserTaskStatus(task.status) === st.value
              return (
                <Pressable
                  key={st.value}
                  style={[styles.chip, active && styles.chipActive]}
                  disabled={saving}
                  onPress={() => void patchTask({ status: st.value })}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{st.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {USER_TASK_PRIORITIES.map((p) => {
              const active = String(task.priority || 'medium').toLowerCase() === p.value
              return (
                <Pressable
                  key={p.value}
                  style={[styles.chip, active && styles.chipActive]}
                  disabled={saving}
                  onPress={() => void patchTask({ priority: p.value })}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {lists.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>List</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {lists.map((list) => {
                const active = task.listId === list.id
                return (
                  <Pressable
                    key={list.id}
                    style={[styles.chip, active && styles.chipActive]}
                    disabled={saving}
                    onPress={() => void patchTask({ listId: list.id })}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{list.name}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Due date</Text>
          <DateTimeField
            label="Due date"
            mode="date"
            value={dueDateFieldValue(task.dueDate)}
            onChange={(v) => {
              const iso = v ? new Date(v).toISOString() : null
              void patchTask({ dueDate: iso })
              setTask((prev) => (prev ? { ...prev, dueDate: iso } : prev))
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <TextInput
            style={styles.fieldInput}
            value={categoryDraft}
            onChangeText={setCategoryDraft}
            placeholder="Optional category"
            placeholderTextColor={erp.textSubtle}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <TextInput
            style={styles.descInput}
            value={descDraft}
            onChangeText={setDescDraft}
            placeholder="Add details…"
            placeholderTextColor={erp.textSubtle}
            multiline
            textAlignVertical="top"
          />
        </View>

        {tags.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.tagRow}>
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id)
                return (
                  <Pressable
                    key={tag.id}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    onPress={() => void toggleTag(tag.id)}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag.name}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          {checklist.map((item, idx) => (
            <View key={item.id || idx} style={styles.checkRow}>
              <Pressable onPress={() => void toggleChecklistItem(idx)}>
                <FontAwesome5
                  name={item.completed ? 'check-square' : 'square'}
                  size={18}
                  color={item.completed ? erp.primary : erp.textSubtle}
                />
              </Pressable>
              <Text style={[styles.checkText, item.completed && styles.checkDone]}>{item.text}</Text>
              <Pressable onPress={() => void removeChecklistItem(idx)}>
                <FontAwesome5 name="times" size={14} color={erp.textSubtle} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addCheckRow}>
            <TextInput
              style={styles.checkInput}
              value={newChecklistText}
              onChangeText={setNewChecklistText}
              placeholder="Add checklist item"
              placeholderTextColor={erp.textSubtle}
              onSubmitEditing={() => void addChecklistItem()}
            />
            <Pressable style={styles.addBtn} onPress={() => void addChecklistItem()}>
              <FontAwesome5 name="plus" size={14} color={erp.primary} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.saveBtn, saving && styles.disabled]}
          disabled={saving}
          onPress={() => void saveFields()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>{isNew ? 'Create task' : 'Save changes'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    header: {
      paddingTop: 12,
      paddingHorizontal: erp.space.lg,
      paddingBottom: 12,
      backgroundColor: erp.surface,
      borderBottomWidth: 1,
      borderBottomColor: erp.border
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
    titleInput: { fontSize: 22, fontWeight: '800', color: erp.text, paddingVertical: 4 },
    titleCompleted: { textDecorationLine: 'line-through', opacity: 0.7 },
    headerActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    iconBtn: { padding: 4 },
    body: { padding: erp.space.lg, gap: 16, paddingBottom: 40 },
    section: { gap: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: erp.textMuted, textTransform: 'uppercase' },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      marginRight: 8
    },
    chipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: erp.textMuted },
    chipTextActive: { color: '#fff' },
    fieldInput: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 12,
      backgroundColor: erp.surface,
      color: erp.text,
      fontSize: 15
    },
    descInput: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.lg,
      padding: 14,
      backgroundColor: erp.surface,
      color: erp.text,
      fontSize: 15,
      lineHeight: 22
    },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    tagChipActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
    tagText: { fontSize: 12, fontWeight: '600', color: erp.textMuted },
    tagTextActive: { color: '#1d4ed8' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    checkText: { flex: 1, fontSize: 15, color: erp.text },
    checkDone: { textDecorationLine: 'line-through', opacity: 0.6 },
    addCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    checkInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      padding: 10,
      backgroundColor: erp.surface,
      color: erp.text
    },
    addBtn: { padding: 10 },
    saveBtn: {
      backgroundColor: erp.primary,
      borderRadius: erp.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8
    },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    disabled: { opacity: 0.6 },
    error: { color: erp.danger, fontWeight: '600', textAlign: 'center' },
    inlineError: { color: erp.danger, fontWeight: '600' },
    backLink: { color: erp.primary, fontWeight: '700', marginTop: 12 }
  })
}
