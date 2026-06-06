import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { statusColor } from '../utils'

type Props = {
  label: string
  compact?: boolean
}

export function ProjectStatusBadge({ label, compact }: Props) {
  const color = statusColor(label)
  return (
    <View style={[styles.badge, compact && styles.compact, { backgroundColor: `${color}18` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start'
  },
  compact: { paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '800' },
  textCompact: { fontSize: 11 }
})
