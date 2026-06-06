import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'

import type { ProjectInsights } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  insights: ProjectInsights
  taskScope: string
  onScopePress: (scope: 'mine' | 'overdue' | 'dueSoon') => void
}

export function ProjectInsightsBar({ insights, taskScope, onScopePress }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const chips = [
    {
      key: 'mine' as const,
      label: 'My open',
      value: insights.myOpenTasks,
      icon: 'user-check',
      color: erp.primary
    },
    {
      key: 'overdue' as const,
      label: 'Overdue',
      value: insights.overdueTasks,
      icon: 'exclamation-circle',
      color: erp.danger
    },
    {
      key: 'dueSoon' as const,
      label: 'Due soon',
      value: insights.dueSoonTasks,
      icon: 'clock',
      color: erp.warning
    }
  ]

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <View style={styles.summaryCard}>
        <Text style={styles.summaryNum}>{insights.activeProjects}</Text>
        <Text style={styles.summaryLbl}>Active projects</Text>
      </View>
      {chips.map((c) => {
        const active = taskScope === c.key
        return (
          <Pressable
            key={c.key}
            style={[styles.chip, active && { borderColor: c.color, backgroundColor: `${c.color}12` }]}
            onPress={() => onScopePress(c.key)}
          >
            <FontAwesome5 name={c.icon} size={12} color={c.color} />
            <Text style={[styles.chipLabel, active && { color: c.color }]}>{c.label}</Text>
            <Text style={[styles.chipValue, { color: c.color }]}>{c.value}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  row: { paddingHorizontal: erp.space.lg, paddingBottom: 10, gap: 8, alignItems: 'stretch' },
  summaryCard: {
    backgroundColor: erp.primarySoft,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: erp.primaryMuted,
    justifyContent: 'center',
    minWidth: 110
  },
  summaryNum: { fontSize: 20, fontWeight: '800', color: erp.primary },
  summaryLbl: { fontSize: 11, fontWeight: '700', color: erp.textMuted, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  chipLabel: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  chipValue: { fontSize: 14, fontWeight: '800' }
  })
}