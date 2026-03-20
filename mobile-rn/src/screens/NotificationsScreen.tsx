import React, { useCallback, useState } from 'react'
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { apiClient } from '../services/apiClient'
import { useAuth } from '../state/AuthContext'

export function NotificationsScreen() {
  const { accessToken } = useAuth()
  const [items, setItems] = useState<Array<{ id: string; title?: string; message?: string }>>([])

  const load = useCallback(async () => {
    if (!accessToken) return
    const list = await apiClient.getNotifications(accessToken)
    setItems(Array.isArray(list) ? list : [])
  }, [accessToken])

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={load}>
        <Text style={styles.buttonText}>Refresh Notifications</Text>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.item}>{item.title || item.message || item.id}</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16 },
  button: { backgroundColor: '#ea580c', borderRadius: 8, padding: 10, marginBottom: 12 },
  buttonText: { color: '#ffffff', fontWeight: '600', textAlign: 'center' },
  item: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 10 }
})
