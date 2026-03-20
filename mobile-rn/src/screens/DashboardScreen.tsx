import React from 'react'
import { SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../state/AuthContext'

export function DashboardScreen() {
  const { user } = useAuth()
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  card: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  label: { color: '#6b7280', fontSize: 12 },
  value: { fontSize: 16, fontWeight: '600' }
})
