import React, { useCallback, useState } from 'react'
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { apiClient } from '../services/apiClient'
import { useAuth } from '../state/AuthContext'

export function ClientsScreen() {
  const { accessToken } = useAuth()
  const [items, setItems] = useState<Array<{ id: string; name: string; status?: string }>>([])

  const load = useCallback(async () => {
    if (!accessToken) return
    const list = await apiClient.getClients(accessToken)
    setItems(Array.isArray(list) ? list : [])
  }, [accessToken])

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={load}>
        <Text style={styles.buttonText}>Load Clients</Text>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.item}>{item.name || item.id}</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 10, marginBottom: 12 },
  buttonText: { color: '#ffffff', fontWeight: '600', textAlign: 'center' },
  item: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 10 }
})
