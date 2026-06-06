import { StyleSheet } from 'react-native'
import { useMemo } from 'react'
import type { JcTheme } from '../theme/palettes'
import { useTheme } from '../theme/ThemeContext'

export function createFormStyles(jc: JcTheme) {
  return StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: jc.radius.md,
      paddingHorizontal: jc.space.md,
      paddingVertical: 14,
      fontSize: 16,
      backgroundColor: jc.surface,
      color: jc.text
    },
    multiline: {
      minHeight: 96,
      textAlignVertical: 'top'
    },
    readOnly: {
      backgroundColor: jc.surfaceMuted,
      color: jc.text
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: jc.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.35
    },
    row: {
      flexDirection: 'row',
      gap: jc.space.sm,
      alignItems: 'center'
    },
    primaryBtn: {
      backgroundColor: jc.primary,
      paddingVertical: 14,
      paddingHorizontal: jc.space.lg,
      borderRadius: jc.radius.md,
      alignItems: 'center'
    },
    primaryBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: jc.primaryMuted,
      backgroundColor: jc.primarySoft,
      paddingVertical: 12,
      paddingHorizontal: jc.space.md,
      borderRadius: jc.radius.md,
      alignItems: 'center'
    },
    secondaryBtnText: {
      color: jc.primaryDark,
      fontWeight: '700',
      fontSize: 14
    },
    ghostBtn: {
      paddingVertical: 10,
      alignItems: 'center'
    },
    ghostBtnText: {
      color: jc.primary,
      fontWeight: '600',
      fontSize: 14
    }
  })
}

export function useFormStyles() {
  const { jc } = useTheme()
  return useMemo(() => createFormStyles(jc), [jc])
}
