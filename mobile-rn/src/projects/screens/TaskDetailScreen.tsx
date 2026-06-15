import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheEntityDetail,
  projectTaskDetailCacheKey,
  readEntityDetail
} from '../../offline/entityDetailCache'
import { offlineListMessage } from '../../offline/erpReadCaches'
import { useAuth } from '../../state/AuthContext'

import {
  DateTimeField,
  parseFieldDate,
  toDateLocal
} from '../../jobcards/components/DateTimeField'
import { projectsApi } from '../api'
import { AssigneePickerModal } from '../components/AssigneePickerModal'
import { ProjectStatusBadge } from '../components/ProjectStatusBadge'
import type { ProjectsStackParamList } from '../navigation'
import type { ChecklistItem, ErpUser, ProjectTask, TaskComment } from '../types'
import {
  formatDate,
  formatDateTime,
  isTaskOverdue,
  TASK_PRIORITIES,
  TASK_STATUSES
} from '../utils'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<ProjectsStackParamList, 'TaskDetail'>

function dueDateFieldValue(iso?: string | null): string {
  if (!iso) return ''
  return toDateLocal(parseFieldDate(iso, 'date'))
}

export function TaskDetailScreen({ route, navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const { taskId, projectId, projectName } = route.params
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [readOnlyOffline, setReadOnlyOffline] = useState(false)
  const [task, setTask] = useState<ProjectTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [users, setUsers] = useState<ErpUser[]>([])
  const [showAssignee, setShowAssignee] = useState(false)
  const [showSubtask, setShowSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)
  const [newChecklistText, setNewChecklistText] = useState('')
  const [addingChecklist, setAddingChecklist] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    setReadOnlyOffline(false)

    const applyCached = async () => {
      const cached = await readEntityDetail<ProjectTask>(projectTaskDetailCacheKey(taskId))
      if (cached) {
        setTask(cached)
        setTitleDraft(cached.title || '')
        setDescDraft(cached.description || '')
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
      const t = await projectsApi.getTask(accessToken, taskId)
      setTask(t)
      setTitleDraft(t.title || '')
      setDescDraft(t.description || '')
      await cacheEntityDetail(projectTaskDetailCacheKey(taskId), t)
    } catch (e) {
      const hadCache = await applyCached()
      if (!hadCache) {
        setError(e instanceof Error ? e.message : 'Could not load task')
      }
    } finally {
      setLoading(false)
    }
  }, [accessToken, isOnline, taskId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!accessToken) return
    void projectsApi.listUsers(accessToken).then(setUsers).catch(() => setUsers([]))
  }, [accessToken])

  const patchTask = async (body: Record<string, unknown>) => {
    if (!accessToken || !task || readOnlyOffline) return
    setSaving(true)
    setError('')
    try {
      const updated = await projectsApi.patchTask(accessToken, taskId, body)
      setTask((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const postComment = async () => {
    if (!accessToken || !commentDraft.trim() || readOnlyOffline) return
    setPostingComment(true)
    try {
      const comment = await projectsApi.addTaskComment(accessToken, {
        taskId,
        projectId,
        text: commentDraft.trim()
      })
      setTask((prev) => {
        if (!prev) return prev
        const comments: TaskComment[] = [...(prev.comments || []), comment]
        return { ...prev, comments }
      })
      setCommentDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post comment')
    } finally {
      setPostingComment(false)
    }
  }

  const saveFields = async () => {
    if (!task) return
    const body: Record<string, unknown> = {}
    if (titleDraft.trim() && titleDraft !== task.title) body.title = titleDraft.trim()
    if (descDraft !== (task.description || '')) body.description = descDraft
    if (Object.keys(body).length) await patchTask(body)
  }

  const toggleChecklistItem = async (idx: number) => {
    if (!task?.checklist) return
    const next: ChecklistItem[] = task.checklist.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    )
    await patchTask({ checklist: next })
  }

  const addChecklistItem = async () => {
    if (!task || !newChecklistText.trim()) return
    setAddingChecklist(true)
    try {
      const next: ChecklistItem[] = [
        ...(task.checklist || []),
        { id: `cl-${Date.now()}`, text: newChecklistText.trim(), done: false }
      ]
      await patchTask({ checklist: next })
      setNewChecklistText('')
    } finally {
      setAddingChecklist(false)
    }
  }

  const removeChecklistItem = async (idx: number) => {
    if (!task?.checklist) return
    const next = task.checklist.filter((_, i) => i !== idx)
    await patchTask({ checklist: next })
  }

  const confirmDeleteTask = () => {
    Alert.alert(
      'Delete task',
      'This will also delete subtasks and comments. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteTask() }
      ]
    )
  }

  const deleteTask = async () => {
    if (!accessToken) return
    setSaving(true)
    setError('')
    try {
      await projectsApi.deleteTask(accessToken, taskId)
      navigation.goBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete task')
    } finally {
      setSaving(false)
    }
  }

  const createSubtask = async () => {
    if (!accessToken || !subtaskTitle.trim()) return
    setCreatingSubtask(true)
    try {
      await projectsApi.createTask(accessToken, {
        projectId,
        parentTaskId: taskId,
        title: subtaskTitle.trim(),
        status: 'To Do',
        priority: 'Medium'
      })
      setSubtaskTitle('')
      setShowSubtask(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add subtask')
    } finally {
      setCreatingSubtask(false)
    }
  }

  const assignUser = async (user: ErpUser | null) => {
    await patchTask({
      assigneeId: user?.id || null,
      assignee: user?.name || user?.email || ''
    })
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

  const comments = task.comments || []
  const subtasks = task.subtasks || []
  const checklist = task.checklist || []
  const overdue = isTaskOverdue(task)

  return (
    <View style={styles.root}>
      <OfflineBanner visible={readOnlyOffline} variant="read" />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>{projectName || 'Project'}</Text>
        </Pressable>
        <TextInput
          style={styles.titleInput}
          value={titleDraft}
          onChangeText={setTitleDraft}
          onBlur={() => void saveFields()}
          placeholder="Task title"
          placeholderTextColor={erp.textSubtle}
        />
        <View style={styles.headerMeta}>
          {task.status ? <ProjectStatusBadge label={task.status} /> : null}
          {overdue ? <Text style={styles.overduePill}>Overdue</Text> : null}
          <Pressable style={styles.deleteBtn} onPress={confirmDeleteTask} disabled={saving}>
            <FontAwesome5 name="trash-alt" size={14} color={erp.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TASK_STATUSES.map((st) => {
              const active = task.status === st
              return (
                <Pressable
                  key={st}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  disabled={saving}
                  onPress={() => void patchTask({ status: st })}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{st}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TASK_PRIORITIES.map((p) => {
              const active = task.priority === p
              return (
                <Pressable
                  key={p}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  disabled={saving}
                  onPress={() => void patchTask({ priority: p })}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{p}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.infoGrid}>
          {task.assignee ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Assignee</Text>
              <Text style={styles.infoValue}>{task.assignee}</Text>
            </View>
          ) : null}
          {task.startDate ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Start</Text>
              <Text style={styles.infoValue}>{formatDate(task.startDate)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Due date</Text>
          <DateTimeField
            label="Due"
            mode="date"
            value={dueDateFieldValue(task.dueDate)}
            onChange={(v) => void patchTask({ dueDate: v || null })}
          />
          {task.dueDate ? (
            <Pressable onPress={() => void patchTask({ dueDate: null })}>
              <Text style={styles.clearLink}>Clear due date</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assignee</Text>
          <Pressable style={styles.assigneeBtn} onPress={() => setShowAssignee(true)}>
            <FontAwesome5 name="user" size={14} color={erp.primary} />
            <Text style={styles.assigneeText}>{task.assignee || 'Tap to assign'}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <TextInput
            style={styles.descriptionInput}
            value={descDraft}
            onChangeText={setDescDraft}
            onBlur={() => void saveFields()}
            placeholder="What needs to be done?"
            placeholderTextColor={erp.textSubtle}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist ({checklist.length})</Text>
          {checklist.length === 0 ? (
            <Text style={styles.emptyComments}>No checklist items yet.</Text>
          ) : (
            checklist.map((item, idx) => (
              <View key={item.id || idx} style={styles.checkItem}>
                <Pressable style={styles.checkToggle} onPress={() => void toggleChecklistItem(idx)}>
                  <FontAwesome5
                    name={item.done ? 'check-square' : 'square'}
                    size={16}
                    color={item.done ? erp.success : erp.textSubtle}
                  />
                  <Text style={[styles.checkText, item.done && styles.checkDone]}>{item.text}</Text>
                </Pressable>
                <Pressable
                  style={styles.checkRemove}
                  onPress={() => void removeChecklistItem(idx)}
                  disabled={saving}
                >
                  <FontAwesome5 name="times" size={14} color={erp.textSubtle} />
                </Pressable>
              </View>
            ))
          )}
          <View style={styles.checkAddRow}>
            <TextInput
              style={styles.checkAddInput}
              placeholder="Add checklist item…"
              placeholderTextColor={erp.textSubtle}
              value={newChecklistText}
              onChangeText={setNewChecklistText}
              onSubmitEditing={() => void addChecklistItem()}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.checkAddBtn, (addingChecklist || !newChecklistText.trim()) && styles.disabled]}
              disabled={addingChecklist || !newChecklistText.trim()}
              onPress={() => void addChecklistItem()}
            >
              <Text style={styles.checkAddBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Subtasks ({subtasks.length})</Text>
            <Pressable onPress={() => setShowSubtask(true)}>
              <Text style={styles.addLink}>+ Add</Text>
            </Pressable>
          </View>
          {subtasks.length === 0 ? (
            <Text style={styles.emptyComments}>No subtasks yet.</Text>
          ) : (
            subtasks.map((st) => (
              <Pressable
                key={st.id}
                style={styles.subtaskCard}
                onPress={() =>
                  navigation.push('TaskDetail', {
                    taskId: st.id,
                    projectId,
                    projectName
                  })
                }
              >
                <Text style={styles.subtaskTitle}>{st.title}</Text>
                {st.status ? <ProjectStatusBadge label={st.status} compact /> : null}
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comments ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.emptyComments}>No comments yet.</Text>
          ) : (
            comments.map((c, idx) => (
              <View key={c.id || idx} style={styles.commentCard}>
                <Text style={styles.commentText}>{c.text || '—'}</Text>
                <Text style={styles.commentMeta}>
                  {[c.author || c.userName, formatDateTime(c.createdAt || c.timestamp)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))
          )}
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment…"
            placeholderTextColor={erp.textSubtle}
            value={commentDraft}
            onChangeText={setCommentDraft}
            multiline
          />
          <Pressable
            style={[styles.postBtn, (postingComment || !commentDraft.trim()) && styles.disabled]}
            disabled={postingComment || !commentDraft.trim()}
            onPress={() => void postComment()}
          >
            {postingComment ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postBtnText}>Post comment</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <AssigneePickerModal
        visible={showAssignee}
        users={users}
        selectedId={task.assigneeId}
        onSelect={(u) => void assignUser(u)}
        onClose={() => setShowAssignee(false)}
      />

      <Modal visible={showSubtask} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add subtask</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Subtask title"
              value={subtaskTitle}
              onChangeText={setSubtaskTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setShowSubtask(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSave, creatingSubtask && styles.disabled]}
                disabled={creatingSubtask || !subtaskTitle.trim()}
                onPress={() => void createSubtask()}
              >
                {creatingSubtask ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  inlineError: { color: erp.danger, fontWeight: '600', marginBottom: 8 },
  backLink: { color: erp.primary, fontWeight: '700', marginTop: 8 },
  header: {
    paddingTop: 12,
    paddingHorizontal: erp.space.lg,
    paddingBottom: 14,
    backgroundColor: erp.surface,
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    gap: 10
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { color: erp.primary, fontWeight: '700', fontSize: 15 },
  titleInput: {
    fontSize: 22,
    fontWeight: '800',
    color: erp.text,
    lineHeight: 28,
    paddingVertical: 4
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: {
    marginLeft: 'auto',
    padding: 8,
    borderRadius: erp.radius.md,
    backgroundColor: erp.dangerSoft
  },
  overduePill: {
    fontSize: 11,
    fontWeight: '800',
    color: erp.danger,
    backgroundColor: erp.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999
  },
  body: { padding: erp.space.lg, paddingBottom: 40, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: erp.textMuted, textTransform: 'uppercase' },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border,
    marginRight: 8
  },
  optionChipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
  optionText: { fontSize: 13, fontWeight: '700', color: erp.textMuted },
  optionTextActive: { color: '#fff' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: erp.border
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: erp.textSubtle, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: erp.text, marginTop: 4 },
  descriptionInput: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    fontSize: 15,
    color: erp.text,
    lineHeight: 22,
    minHeight: 100
  },
  assigneeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border
  },
  assigneeText: { fontSize: 15, fontWeight: '700', color: erp.text },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  addLink: { fontSize: 14, fontWeight: '800', color: erp.primary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: erp.surface,
    borderTopLeftRadius: erp.radius.xl,
    borderTopRightRadius: erp.radius.xl,
    padding: erp.space.lg,
    paddingBottom: 32
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: erp.text },
  modalInput: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.bg,
    color: erp.text,
    marginBottom: 12
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: erp.radius.md,
    borderWidth: 1,
    borderColor: erp.border
  },
  modalCancelText: { fontWeight: '700', color: erp.textMuted },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary
  },
  modalSaveText: { fontWeight: '800', color: '#fff' },
  clearLink: { color: erp.primary, fontWeight: '600', fontSize: 13, alignSelf: 'flex-start' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  checkToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkRemove: { padding: 8 },
  checkAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  checkAddInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: erp.surface,
    color: erp.text,
    fontSize: 14
  },
  checkAddBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary
  },
  checkAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  checkText: { fontSize: 14, color: erp.text, flex: 1 },
  checkDone: { textDecorationLine: 'line-through', color: erp.textMuted },
  subtaskCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: erp.border,
    gap: 8
  },
  subtaskTitle: { fontSize: 14, fontWeight: '700', color: erp.text },
  emptyComments: { color: erp.textMuted, fontSize: 14 },
  commentCard: {
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.md,
    padding: 12
  },
  commentText: { fontSize: 14, color: erp.text, lineHeight: 20 },
  commentMeta: { fontSize: 11, color: erp.textSubtle, marginTop: 6 },
  commentInput: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    padding: 12,
    backgroundColor: erp.surface,
    color: erp.text,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  postBtn: {
    backgroundColor: erp.primary,
    borderRadius: erp.radius.md,
    paddingVertical: 12,
    alignItems: 'center'
  },
  postBtnText: { color: '#fff', fontWeight: '800' },
  disabled: { opacity: 0.6 }
  })
}