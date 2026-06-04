import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { loadPendingJobCards } from '../../services/jobCardOffline'
import { jobCardsApi } from '../../services/jobCardsApi'
import { syncPendingJobCards } from '../../services/syncPendingJobCards'
import { useAuth } from '../../state/AuthContext'
import type { JobCardListItem, PendingJobCardRecord } from '../../types/jobCard'

export function JobCardsListScreen({ navigation }: { navigation: any }) {
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const [items, setItems] = useState<JobCardListItem[]>([])
  const [pending, setPending] = useState<PendingJobCardRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const local = await loadPendingJobCards()
      setPending(local)
      if (isOnline) {
        const data = await jobCardsApi.list(accessToken)
        setItems(data.jobCards || [])
        if (local.length) {
          setSyncing(true)
          const result = await syncPendingJobCards(accessToken)
          setPending(result.remaining)
          if (result.synced > 0) {
            const refreshed = await jobCardsApi.list(accessToken)
            setItems(refreshed.jobCards || [])
          }
        }
      }
    } catch (error) {
      Alert.alert('Could not load job cards', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [accessToken, isOnline])

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', load)
    return unsub
  }, [navigation, load])

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner visible={!isOnline} />
      <View style={styles.header}>
        <Text style={styles.title}>Job cards</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('JobCardForm')}>
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {pending.length > 0 ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>
            {pending.length} pending sync{syncing ? '…' : ''}
          </Text>
          {isOnline ? (
            <TouchableOpacity
              onPress={async () => {
                if (!accessToken) return
                setSyncing(true)
                try {
                  const result = await syncPendingJobCards(accessToken)
                  setPending(result.remaining)
                  await load()
                  Alert.alert('Sync complete', `${result.synced} synced, ${result.failed} failed`)
                } finally {
                  setSyncing(false)
                }
              }}
            >
              <Text style={styles.syncLink}>Sync now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {loading && !items.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No job cards yet. Tap New to create one.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('JobCardDetail', { id: item.id })}
            >
              <Text style={styles.rowTitle}>
                {item.jobCardNumber || item.id.slice(0, 8)} — {item.clientName || 'No client'}
              </Text>
              <Text style={styles.rowSub}>
                {item.status || 'draft'}
                {item.travelKilometers != null ? ` · ${item.travelKilometers} km` : ''}
              </Text>
              {item.reasonForVisit ? (
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.reasonForVisit}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  newButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  newButtonText: { color: '#fff', fontWeight: '600' },
  pendingBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  pendingTitle: { color: '#9a3412', fontWeight: '600' },
  syncLink: { color: '#2563eb', marginTop: 4, fontWeight: '600' },
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  rowSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40, paddingHorizontal: 24 }
})
