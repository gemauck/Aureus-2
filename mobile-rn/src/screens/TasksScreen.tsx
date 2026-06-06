import React, { useCallback, useState } from 'react'
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { apiClient } from '../services/apiClient'
import { useAuth } from '../state/AuthContext'
import { useThemedStyles } from '../theme/useThemedStyles'
import type { ErpTheme } from '../theme/palettes'


export function TasksScreen() {
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [items, setItems] = useState<Array<{ id: string; title?: string; name?: string; status?: string }>>([])

  const load = useCallback(async () => {
    if (!accessToken) return
    const list = await apiClient.getTasks(accessToken)
    setItems(Array.isArray(list) ? list : [])
  }, [accessToken])

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={load}>
        <Text style={styles.buttonText}>Load Tasks</Text>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.item}>{item.title || item.name || item.id}</Text>}
      />
    </SafeAreaView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: erp.bg, padding: 16 },
  button: { backgroundColor: erp.primary, borderRadius: 8, padding: 10, marginBottom: 12 },
  buttonText: { color: '#ffffff', fontWeight: '600', textAlign: 'center' },
  item: {
    borderBottomWidth: 1,
    borderBottomColor: erp.border,
    paddingVertical: 10,
    color: erp.text
  }
  })
}