import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

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
    backgroundColor: '#fef3c7',
    borderBottomColor: '#fcd34d',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  text: { color: '#92400e', fontSize: 13, fontWeight: '600', textAlign: 'center' }
})
