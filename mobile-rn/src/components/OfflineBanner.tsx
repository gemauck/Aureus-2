import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'


type OfflineBannerProps = {
  visible: boolean
  /** sync = field capture queues; read = browse cached lists (Phase 2 navigation). */
  variant?: 'sync' | 'read'
}

export function OfflineBanner({ visible, variant = 'sync' }: OfflineBannerProps) {
  const styles = useThemedStyles(createStyles)
  if (!visible) return null
  const text =
    variant === 'read'
      ? 'Offline — showing saved copy. Connect to refresh.'
      : 'Offline — changes will sync when you reconnect'
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{text}</Text>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  banner: {
    backgroundColor: erp.warningSoft,
    borderBottomColor: erp.warning,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  text: { color: erp.warning, fontSize: 13, fontWeight: '600', textAlign: 'center' }
  })
}