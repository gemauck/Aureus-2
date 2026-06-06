import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'


type Props = {
  children: React.ReactNode
  style?: ViewStyle
  padded?: boolean
}

export function ScreenBody({ children, style, padded = true }: Props) {
  const styles = useThemedStyles(createStyles)
  return <View style={[styles.body, padded && styles.padded, style]}>{children}</View>
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  body: { flex: 1, backgroundColor: erp.bg },
  padded: { paddingHorizontal: erp.space.lg }
  })
}