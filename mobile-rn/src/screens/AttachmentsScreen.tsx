import React, { useState } from 'react'
import { Alert, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../state/AuthContext'

export function AttachmentsScreen() {
  const { accessToken } = useAuth()
  const [endpoint, setEndpoint] = useState('/api/project-documents')

  async function submitPlaceholder() {
    if (!accessToken) {
      Alert.alert('Not authenticated', 'Sign in first')
      return
    }
    Alert.alert('Attachment flow', `Upload shell ready for ${endpoint}`)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Attachment Upload Shell</Text>
        <TextInput style={styles.input} value={endpoint} onChangeText={setEndpoint} />
        <Button title="Validate Upload Route" onPress={submitPlaceholder} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16 },
  card: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }
})
