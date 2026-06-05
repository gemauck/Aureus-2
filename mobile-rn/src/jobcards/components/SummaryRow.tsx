import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { jc } from '../theme'

export function SummaryRow({ label, value }: { label: string; value?: string | number | null }) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—'
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={3}>
        {display}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: jc.space.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: jc.border
  },
  label: {
    flex: 0.42,
    fontSize: 13,
    color: jc.textMuted,
    fontWeight: '500'
  },
  value: {
    flex: 0.58,
    fontSize: 14,
    color: jc.text,
    fontWeight: '600',
    textAlign: 'right'
  }
})
