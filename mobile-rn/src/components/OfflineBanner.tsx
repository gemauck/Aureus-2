import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { erp } from '../theme/appTheme'

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — changes will sync when you reconnect</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: erp.warningSoft,
    borderBottomColor: erp.warning,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  text: { color: erp.warning, fontSize: 13, fontWeight: '600', textAlign: 'center' }
})
