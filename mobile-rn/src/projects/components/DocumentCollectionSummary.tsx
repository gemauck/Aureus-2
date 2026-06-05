import React from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import { erp } from '../../theme/appTheme'
import type { DocCollectionSummary } from '../types'
import { webProjectUrl } from '../utils'

type Props = {
  summary: DocCollectionSummary
  projectId: string
}

export function DocumentCollectionSummary({ summary, projectId }: Props) {
  const pct = summary.totalCells
    ? Math.round((summary.collected / summary.totalCells) * 100)
    : 0

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <FontAwesome5 name="folder-open" size={16} color={erp.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Document collection</Text>
          <Text style={styles.sub}>{summary.monthLabel}</Text>
        </View>
        <Pressable onPress={() => void Linking.openURL(webProjectUrl(projectId, 'documentCollection'))}>
          <Text style={styles.link}>Open tracker</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.stats}>
        <Stat label="Collected" value={summary.collected} color={erp.success} />
        <Stat label="Pending" value={summary.pending} color={erp.warning} />
        <Stat label="Other" value={summary.other} color={erp.textMuted} />
      </View>
      <Text style={styles.hint}>
        Tracks client documents requested each month — open the full grid on web to update statuses.
      </Text>
    </View>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statNum, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    gap: 10
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: erp.text },
  sub: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
  link: { fontSize: 12, fontWeight: '800', color: erp.primary },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    overflow: 'hidden'
  },
  progressFill: { height: '100%', backgroundColor: erp.success, borderRadius: 999 },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 11, color: erp.textMuted, fontWeight: '600' },
  hint: { fontSize: 12, color: erp.textSubtle, lineHeight: 17 }
})
