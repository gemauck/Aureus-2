import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'

type Option = { value: string; label: string }

type Props = {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
}

export function OptionChips({ label, value, options, onChange }: Props) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <Pressable
              key={opt.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    label: { fontSize: 13, fontWeight: '600', color: erp.text },
    scroll: { flexGrow: 0 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface,
      marginRight: 8
    },
    chipActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    chipText: { fontSize: 12, color: erp.textMuted, fontWeight: '500' },
    chipTextActive: { color: '#fff' }
  })
