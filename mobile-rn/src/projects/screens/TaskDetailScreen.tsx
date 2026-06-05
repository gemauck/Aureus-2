import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAuth } from '../../state/AuthContext'
import { erp } from '../../theme/appTheme'
import { projectsApi } from '../api'
import { ProjectStatusBadge } from '../components/ProjectStatusBadge'
import type { ProjectsStackParamList } from '../navigation'
import type { ProjectTask, TaskComment } from '../types'
import { formatDate, formatDateTime, TASK_PRIORITIES, TASK_STATUSES } from '../utils'

type Props = NativeStackScreenProps<ProjectsStackParamList, 'TaskDetail'>

export function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId, projectId, projectName } = route.params
  const { accessToken } = useAuth()
  const [task, setTask] = useState<ProjectTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const t = await projectsApi.getTask(accessToken, taskId)
      setTask(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load task')
    } finally {
      setLoading(false)
    }
  }, [accessToken, taskId])

  useEffect(() => {
    void load()
  }, [load])

  const patchTask = async (body: Record<string, unknown>) => {
    if (!accessToken || !task) return
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
    if (!accessToken || !commentDraft.trim()) return
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome5 name="arrow-left" size={16} color={erp.primary} />
          <Text style={styles.backText}>{projectName || 'Project'}</Text>
        </Pressable>
        <Text style={styles.title}>{task.title || 'Untitled task'}</Text>
        {task.status ? <ProjectStatusBadge label={task.status} /> : null}
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
          {task.dueDate ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Due</Text>
              <Text style={styles.infoValue}>{formatDate(task.dueDate)}</Text>
            </View>
          ) : null}
          {task.startDate ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Start</Text>
              <Text style={styles.infoValue}>{formatDate(task.startDate)}</Text>
            </View>
          ) : null}
        </View>

        {task.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{task.description}</Text>
          </View>
        ) : null}

        {checklist.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {checklist.map((item, idx) => (
              <View key={item.id || idx} style={styles.checkItem}>
                <FontAwesome5
                  name={item.done ? 'check-square' : 'square'}
                  size={16}
                  color={item.done ? erp.success : erp.textSubtle}
                />
                <Text style={[styles.checkText, item.done && styles.checkDone]}>{item.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {subtasks.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subtasks ({subtasks.length})</Text>
            {subtasks.map((st) => (
              <View key={st.id} style={styles.subtaskCard}>
                <Text style={styles.subtaskTitle}>{st.title}</Text>
                {st.status ? <ProjectStatusBadge label={st.status} compact /> : null}
              </View>
            ))}
          </View>
        ) : null}

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
    </View>
  )
}

const styles = StyleSheet.create({
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
  title: { fontSize: 22, fontWeight: '800', color: erp.text, lineHeight: 28 },
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
  description: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    fontSize: 15,
    color: erp.text,
    lineHeight: 22
  },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
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
