import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { apiClient } from '../../services/apiClient'
import { enqueuePendingJobCard } from '../../services/jobCardOffline'
import { draftToApiBody, jobCardsApi } from '../../services/jobCardsApi'
import {
  createTripSession,
  latestPoint,
  startTripTracking,
  stopTripTracking
} from '../../services/tripTracker'
import { useAuth } from '../../state/AuthContext'
import {
  CALL_OUT_CATEGORIES,
  type ClientOption,
  type JobCardDraftPayload,
  type TripSession
} from '../../types/jobCard'

function newDraftId() {
  return `jc_mob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function parseClientSites(client: ClientOption) {
  const raw = client.clientSites
  if (Array.isArray(raw) && raw.length) {
    return raw.map((s) => ({
      id: s.id,
      name: s.name || s.siteName || s.id
    }))
  }
  try {
    const sitesJson = (client as { sites?: string }).sites
    if (typeof sitesJson === 'string' && sitesJson.trim()) {
      const parsed = JSON.parse(sitesJson)
      if (Array.isArray(parsed)) {
        return parsed.map((s: { id?: string; name?: string; siteName?: string }, i: number) => ({
          id: s.id || `site_${i}`,
          name: s.name || s.siteName || `Site ${i + 1}`
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function JobCardFormScreen({ navigation }: { navigation: any }) {
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientModal, setClientModal] = useState(false)
  const [loadingClients, setLoadingClients] = useState(false)
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [siteId, setSiteId] = useState('')
  const [siteName, setSiteName] = useState('')
  const [location, setLocation] = useState('')
  const [reasonForVisit, setReasonForVisit] = useState('')
  const [callOutCategory, setCallOutCategory] = useState<string>(CALL_OUT_CATEGORIES[0])
  const [diagnosis, setDiagnosis] = useState('')
  const [actionsTaken, setActionsTaken] = useState('')
  const [trip, setTrip] = useState<TripSession>(createTripSession)

  const draftId = useMemo(() => newDraftId(), [])
  const sites = useMemo(() => {
    const c = clients.find((x) => x.id === clientId)
    return c ? parseClientSites(c) : []
  }, [clients, clientId])

  const loadClients = useCallback(async () => {
    if (!accessToken) return
    setLoadingClients(true)
    try {
      const list = await apiClient.getClients(accessToken)
      setClients(
        (list || []).map((c) => ({
          ...c,
          name: c.name || c.id
        }))
      )
    } catch (error) {
      Alert.alert('Clients', error instanceof Error ? error.message : 'Could not load clients')
    } finally {
      setLoadingClients(false)
    }
  }, [accessToken])

  React.useEffect(() => {
    loadClients()
  }, [loadClients])

  function buildPayload(status: 'draft' | 'submitted'): JobCardDraftPayload {
    const now = new Date().toISOString()
    const last = latestPoint(trip)
    return {
      clientDraftId: draftId,
      agentName: user?.name || user?.email || '',
      clientId,
      clientName,
      siteId,
      siteName,
      location,
      locationLatitude: last ? String(last.latitude) : undefined,
      locationLongitude: last ? String(last.longitude) : undefined,
      reasonForVisit,
      callOutCategory,
      diagnosis,
      actionsTaken,
      timeOfDeparture: trip.startedAt || undefined,
      timeOfArrival: trip.endedAt || undefined,
      kmReadingBefore: 0,
      kmReadingAfter: trip.distanceKm > 0 ? trip.distanceKm : undefined,
      status,
      startedAt: now,
      createdAt: now,
      trip
    }
  }

  async function persist(status: 'draft' | 'submitted') {
    if (!clientId || !clientName) {
      Alert.alert('Client required', 'Select a client before saving.')
      return
    }
    if (!reasonForVisit.trim()) {
      Alert.alert('Reason required', 'Enter a reason for the visit.')
      return
    }

    const payload = buildPayload(status)
    setSaving(true)
    try {
      if (isOnline && accessToken) {
        await jobCardsApi.create(accessToken, draftToApiBody(payload))
        Alert.alert('Saved', status === 'submitted' ? 'Job card submitted.' : 'Job card saved.')
        navigation.goBack()
      } else {
        await enqueuePendingJobCard({
          id: draftId,
          payload,
          createdAt: payload.createdAt
        })
        Alert.alert(
          'Saved offline',
          'Job card is queued on this device and will sync when you are online.'
        )
        navigation.goBack()
      }
    } catch (error) {
      if (accessToken && isOnline) {
        await enqueuePendingJobCard({
          id: draftId,
          payload,
          createdAt: payload.createdAt,
          lastError: error instanceof Error ? error.message : 'Save failed'
        })
        Alert.alert(
          'Saved offline',
          'Server unreachable — job card queued for sync on this device.'
        )
        navigation.goBack()
      } else {
        Alert.alert('Save failed', error instanceof Error ? error.message : 'Unknown error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function onStartTrip() {
    try {
      const next = await startTripTracking(setTrip, trip)
      setTrip(next)
    } catch (error) {
      Alert.alert('Trip', error instanceof Error ? error.message : 'Could not start trip')
    }
  }

  async function onEndTrip() {
    try {
      const next = await stopTripTracking(trip)
      setTrip(next)
      const last = latestPoint(next)
      if (last && !location.trim()) {
        setLocation(`${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`)
      }
    } catch (error) {
      Alert.alert('Trip', error instanceof Error ? error.message : 'Could not end trip')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner visible={!isOnline} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>New job card</Text>
        <Text style={styles.hint}>Native app — GPS travel while the app is open.</Text>

        <Text style={styles.label}>Client *</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setClientModal(true)}>
          <Text style={styles.pickerText}>{clientName || 'Select client…'}</Text>
        </TouchableOpacity>

        {sites.length > 0 ? (
          <>
            <Text style={styles.label}>Site</Text>
            <View style={styles.chips}>
              {sites.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, siteId === s.id && styles.chipActive]}
                  onPress={() => {
                    setSiteId(s.id)
                    setSiteName(s.name)
                  }}
                >
                  <Text style={[styles.chipText, siteId === s.id && styles.chipTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Travel (leave office)</Text>
        <View style={styles.tripBox}>
          {trip.active ? (
            <Text style={styles.tripActive}>Tracking trip… {trip.distanceKm.toFixed(2)} km</Text>
          ) : trip.endedAt ? (
            <Text style={styles.tripDone}>
              Trip recorded: {trip.distanceKm.toFixed(2)} km
              {trip.startedAt ? `\nLeft: ${new Date(trip.startedAt).toLocaleString()}` : ''}
              {trip.endedAt ? `\nArrived: ${new Date(trip.endedAt).toLocaleString()}` : ''}
            </Text>
          ) : (
            <Text style={styles.tripIdle}>Start when you leave the office to log time and GPS distance.</Text>
          )}
          <View style={styles.tripActions}>
            {!trip.active && !trip.endedAt ? (
              <TouchableOpacity style={styles.tripStart} onPress={onStartTrip}>
                <Text style={styles.tripBtnText}>Start trip</Text>
              </TouchableOpacity>
            ) : null}
            {trip.active ? (
              <TouchableOpacity style={styles.tripStop} onPress={onEndTrip}>
                <Text style={styles.tripBtnText}>Arrived on site</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Address or coordinates"
        />

        <Text style={styles.label}>Call-out category</Text>
        <View style={styles.chips}>
          {CALL_OUT_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, callOutCategory === cat && styles.chipActive]}
              onPress={() => setCallOutCategory(cat)}
            >
              <Text style={[styles.chipText, callOutCategory === cat && styles.chipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Reason for visit *</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={reasonForVisit}
          onChangeText={setReasonForVisit}
          multiline
          placeholder="Why are you on site?"
        />

        <Text style={styles.label}>Diagnosis</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={diagnosis}
          onChangeText={setDiagnosis}
          multiline
        />

        <Text style={styles.label}>Work done</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={actionsTaken}
          onChangeText={setActionsTaken}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.disabled]}
          disabled={saving}
          onPress={() => persist('draft')}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save draft'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.disabled]}
          disabled={saving}
          onPress={() => persist('submitted')}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Saving…' : 'Submit job card'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={clientModal} animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select client</Text>
            <TouchableOpacity onPress={() => setClientModal(false)}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          {loadingClients ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : (
            <ScrollView>
              {clients.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.clientRow}
                  onPress={() => {
                    setClientId(c.id)
                    setClientName(c.name)
                    setSiteId('')
                    setSiteName('')
                    setClientModal(false)
                  }}
                >
                  <Text style={styles.clientName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  picker: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12
  },
  pickerText: { fontSize: 16, color: '#0f172a' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff'
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#334155' },
  chipTextActive: { color: '#fff' },
  tripBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  tripIdle: { color: '#1e40af', fontSize: 14 },
  tripActive: { color: '#1d4ed8', fontWeight: '700', fontSize: 15 },
  tripDone: { color: '#1e3a8a', fontSize: 14, lineHeight: 20 },
  tripActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tripStart: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, padding: 12 },
  tripStop: { flex: 1, backgroundColor: '#059669', borderRadius: 8, padding: 12 },
  tripBtnText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  saveBtn: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    padding: 14
  },
  saveBtnText: { color: '#2563eb', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  submitBtn: {
    marginTop: 10,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14
  },
  submitBtnText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  disabled: { opacity: 0.6 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  close: { color: '#2563eb', fontWeight: '600' },
  clientRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  clientName: { fontSize: 16, color: '#0f172a' }
})
