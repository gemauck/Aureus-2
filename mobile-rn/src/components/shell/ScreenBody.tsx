import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { erp } from '../../theme/appTheme'

type Props = {
  children: React.ReactNode
  style?: ViewStyle
  padded?: boolean
}

export function ScreenBody({ children, style, padded = true }: Props) {
  return <View style={[styles.body, padded && styles.padded, style]}>{children}</View>
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: erp.bg },
  padded: { paddingHorizontal: erp.space.lg }
})
