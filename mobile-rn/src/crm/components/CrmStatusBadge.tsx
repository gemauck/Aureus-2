import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { statusTint } from '../utils'

type Props = { label: string; compact?: boolean }

export function CrmStatusBadge({ label, compact }: Props) {
  const text = String(label || '').trim() || '—'
  const tint = statusTint(text)
  return (
    <View style={[styles.badge, compact && styles.compact, { backgroundColor: `${tint}18` }]}>
      <Text style={[styles.text, { color: tint }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  compact: { paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '700' }
})
