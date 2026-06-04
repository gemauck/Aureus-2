import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { jobCardsApi } from '../../services/jobCardsApi'
import { useAuth } from '../../state/AuthContext'
import type { JobCardDetail } from '../../types/jobCard'

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{String(value)}</Text>
    </View>
  )
}

export function JobCardDetailScreen({ route }: { route: any }) {
  const { accessToken } = useAuth()
  const [card, setCard] = useState<JobCardDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const data = await jobCardsApi.get(accessToken, route.params.id)
      setCard(data.jobCard)
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not load job card')
    } finally {
      setLoading(false)
    }
  }, [accessToken, route.params.id])

  React.useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    )
  }

  if (!card) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>Job card not found</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{card.jobCardNumber || card.id}</Text>
        <Text style={styles.subtitle}>{card.clientName}</Text>
        <Field label="Status" value={card.status} />
        <Field label="Agent" value={card.agentName} />
        <Field label="Site" value={card.siteName} />
        <Field label="Location" value={card.location} />
        <Field label="Category" value={card.callOutCategory} />
        <Field label="Reason" value={card.reasonForVisit} />
        <Field label="Diagnosis" value={card.diagnosis} />
        <Field label="Work done" value={card.actionsTaken} />
        <Field label="Travel (km)" value={card.travelKilometers} />
        <Field label="Left office" value={card.timeOfDeparture} />
        <Field label="Arrived on site" value={card.timeOfArrival} />
        <Field label="Left site" value={card.departureFromSite} />
        <Field label="Odometer before" value={card.kmReadingBefore} />
        <Field label="Odometer after" value={card.kmReadingAfter} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 16, color: '#475569', marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase' },
  value: { fontSize: 15, color: '#0f172a', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 40, color: '#64748b' }
})
