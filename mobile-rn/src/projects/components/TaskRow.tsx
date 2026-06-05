import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import type { ProjectTask } from '../types'
import { formatDate, isTaskDueSoon, isTaskOverdue, priorityColor } from '../utils'
import { ProjectStatusBadge } from './ProjectStatusBadge'

type Props = {
  task: ProjectTask
  showProject?: boolean
  onPress: () => void
}

export function TaskRow({ task, showProject, onPress }: Props) {
  const overdue = isTaskOverdue(task)
  const dueSoon = isTaskDueSoon(task)
  const priColor = priorityColor(task.priority)
  const subCount = task.subtasks?.length ?? 0
  const commentCount = task.comments?.length ?? 0

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        overdue && styles.cardOverdue,
        dueSoon && !overdue && styles.cardDueSoon
      ]}
      onPress={onPress}
    >
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {task.title || 'Untitled task'}
        </Text>
        {task.priority ? (
          <View style={[styles.priority, { backgroundColor: `${priColor}18` }]}>
            <Text style={[styles.priorityText, { color: priColor }]}>{task.priority}</Text>
          </View>
        ) : null}
      </View>

      {showProject && task.project?.name ? (
        <Text style={styles.project} numberOfLines={1}>
          <FontAwesome5 name="project-diagram" size={10} color={erp.textMuted} /> {task.project.name}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        {task.status ? <ProjectStatusBadge label={task.status} compact /> : null}
        {task.assignee ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="user" size={10} color={erp.textMuted} /> {task.assignee}
          </Text>
        ) : null}
        {overdue ? (
          <Text style={styles.overdueBadge}>Overdue</Text>
        ) : dueSoon ? (
          <Text style={styles.dueSoonBadge}>Due soon</Text>
        ) : null}
        {task.dueDate ? (
          <Text style={[styles.metaChip, overdue && { color: erp.danger }]}>
            <FontAwesome5 name="calendar" size={10} color={overdue ? erp.danger : erp.textMuted} />{' '}
            {formatDate(task.dueDate)}
          </Text>
        ) : null}
        {subCount > 0 ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="list-ul" size={10} color={erp.textMuted} /> {subCount}
          </Text>
        ) : null}
        {commentCount > 0 ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="comment" size={10} color={erp.textMuted} /> {commentCount}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 8
  },
  cardOverdue: { borderColor: '#fecaca', backgroundColor: '#fffbfb' },
  cardDueSoon: { borderColor: '#fde68a' },
  pressed: { opacity: 0.92 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: erp.text, lineHeight: 20 },
  priority: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  project: { fontSize: 12, color: erp.textMuted, marginTop: 6, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  metaChip: { fontSize: 12, color: erp.textMuted, fontWeight: '600' },
  overdueBadge: { fontSize: 10, fontWeight: '800', color: erp.danger },
  dueSoonBadge: { fontSize: 10, fontWeight: '800', color: erp.warning }
})
