import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import type { ProjectSummary } from '../types'
import { formatDateRange, progressPercent } from '../utils'
import { ProjectStatusBadge } from './ProjectStatusBadge'

type Props = {
  project: ProjectSummary
  starred?: boolean
  onPress: () => void
  onToggleStar?: () => void
}

export function ProjectRow({ project, starred, onPress, onToggleStar }: Props) {
  const pct = progressPercent(project)
  const taskCount = project.tasksCount

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(project.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>
            {project.name || 'Unnamed project'}
          </Text>
          {project.clientName ? (
            <Text style={styles.client} numberOfLines={1}>
              {project.clientName}
            </Text>
          ) : null}
        </View>
        {onToggleStar ? (
          <Pressable
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation?.()
              onToggleStar()
            }}
          >
            <FontAwesome5
              name="star"
              solid={!!starred}
              size={18}
              color={starred ? '#f59e0b' : erp.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        {project.status ? <ProjectStatusBadge label={project.status} compact /> : null}
        {taskCount != null && taskCount > 0 ? (
          <Text style={styles.metaChip}>
            <FontAwesome5 name="tasks" size={10} color={erp.textMuted} /> {taskCount}
          </Text>
        ) : null}
        {project.type ? <Text style={styles.metaChip}>{project.type}</Text> : null}
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{pct}%</Text>
      </View>

      {project.startDate || project.dueDate ? (
        <Text style={styles.dates}>{formatDateRange(project.startDate, project.dueDate)}</Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 10,
    ...erp.shadowSm
  },
  pressed: { opacity: 0.92 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: erp.primarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: erp.primary },
  name: { fontSize: 16, fontWeight: '800', color: erp.text, lineHeight: 21 },
  client: { fontSize: 13, color: erp.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  metaChip: { fontSize: 12, color: erp.textMuted, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    overflow: 'hidden'
  },
  progressFill: { height: '100%', backgroundColor: erp.primary, borderRadius: 999 },
  progressLabel: { fontSize: 11, fontWeight: '800', color: erp.textMuted, minWidth: 32 },
  dates: { fontSize: 12, color: erp.textSubtle, marginTop: 8 }
})
