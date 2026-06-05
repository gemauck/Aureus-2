import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import type { ProjectTask, ProjectTaskList } from '../types'
import {
  groupTasksByList,
  groupTasksByStatus,
  isTaskOverdue,
  listColor,
  priorityColor
} from '../utils'

type Props = {
  tasks: ProjectTask[]
  onTaskPress: (task: ProjectTask) => void
}

export function TaskKanbanView({ tasks, onTaskPress }: Props) {
  const columns = groupTasksByStatus(tasks)

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.board}>
      {columns.map((col) => (
        <View key={col.status} style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>{col.status}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{col.tasks.length}</Text>
            </View>
          </View>
          {col.tasks.length === 0 ? (
            <Text style={styles.emptyCol}>No tasks</Text>
          ) : (
            col.tasks.map((task) => {
              const overdue = isTaskOverdue(task)
              const pri = priorityColor(task.priority)
              return (
                <Pressable
                  key={task.id}
                  style={[styles.card, overdue && styles.cardOverdue]}
                  onPress={() => onTaskPress(task)}
                >
                  <Text style={styles.cardTitle} numberOfLines={3}>
                    {task.title || 'Untitled'}
                  </Text>
                  <View style={styles.cardMeta}>
                    {task.priority ? (
                      <View style={[styles.priBadge, { backgroundColor: `${pri}18` }]}>
                        <Text style={[styles.priText, { color: pri }]}>{task.priority}</Text>
                      </View>
                    ) : null}
                    {overdue ? (
                      <View style={styles.overdueBadge}>
                        <FontAwesome5 name="exclamation" size={9} color={erp.danger} />
                        <Text style={styles.overdueText}>Overdue</Text>
                      </View>
                    ) : null}
                  </View>
                  {task.assignee ? (
                    <Text style={styles.assignee} numberOfLines={1}>
                      {task.assignee}
                    </Text>
                  ) : null}
                </Pressable>
              )
            })
          )}
        </View>
      ))}
    </ScrollView>
  )
}

export function TaskListGroupedView({
  tasks,
  taskLists,
  onTaskPress
}: {
  tasks: ProjectTask[]
  taskLists: ProjectTaskList[]
  onTaskPress: (task: ProjectTask) => void
}) {
  const groups = groupTasksByList(tasks, taskLists)

  return (
    <View style={styles.grouped}>
      {groups.map((group) => (
        <View key={group.listId} style={styles.group}>
          <View style={styles.groupHeader}>
            <View style={[styles.listDot, { backgroundColor: listColor(group.color) }]} />
            <Text style={styles.groupTitle}>{group.name}</Text>
            <Text style={styles.groupCount}>{group.tasks.length}</Text>
          </View>
          {group.tasks.map((task) => (
            <Pressable key={task.id} style={styles.listCard} onPress={() => onTaskPress(task)}>
              <Text style={styles.listCardTitle} numberOfLines={2}>
                {task.title || 'Untitled'}
              </Text>
              {task.assignee ? <Text style={styles.listCardSub}>{task.assignee}</Text> : null}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  board: { paddingBottom: 8, gap: 10 },
  column: {
    width: 260,
    backgroundColor: erp.surfaceMuted,
    borderRadius: erp.radius.lg,
    padding: 10,
    marginRight: 10
  },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  columnTitle: { fontSize: 13, fontWeight: '800', color: erp.text, flex: 1 },
  countBadge: {
    backgroundColor: erp.surface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  countText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
  emptyCol: { fontSize: 12, color: erp.textSubtle, fontStyle: 'italic', padding: 8 },
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: erp.border,
    ...erp.shadowSm
  },
  cardOverdue: { borderColor: '#fecaca', backgroundColor: '#fffbfb' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: erp.text, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  priBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priText: { fontSize: 10, fontWeight: '800' },
  overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  overdueText: { fontSize: 10, fontWeight: '800', color: erp.danger },
  assignee: { fontSize: 11, color: erp.textMuted, marginTop: 6, fontWeight: '600' },
  grouped: { gap: 16 },
  group: { gap: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listDot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: erp.text, flex: 1 },
  groupCount: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  listCard: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: erp.border
  },
  listCardTitle: { fontSize: 14, fontWeight: '700', color: erp.text },
  listCardSub: { fontSize: 12, color: erp.textMuted, marginTop: 4 }
})
