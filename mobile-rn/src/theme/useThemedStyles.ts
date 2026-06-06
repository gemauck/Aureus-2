import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme } from './ThemeContext'
import type { ErpTheme, JcTheme } from './palettes'

type ThemeSlice = { erp: ErpTheme; jc: JcTheme }

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: ThemeSlice) => T
): T {
  const { erp, jc } = useTheme()
  return useMemo(() => StyleSheet.create(factory({ erp, jc })), [erp, jc])
}
