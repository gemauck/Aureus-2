import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'


export function OfflineBanner({ visible }: { visible: boolean }) {
  const styles = useThemedStyles(createStyles)
  if (!visible) return null
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — changes will sync when you reconnect</Text>
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