import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useNetwork } from '../../hooks/useNetwork'
import { useJobCardSync } from '../JobCardSyncContext'
import type { PendingUploadItem } from '../pendingUploads'
import { useJobCardWizard } from '../WizardContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

function kindLabel(kind: PendingUploadItem['kind']) {
  if (kind === 'job_card') return 'Job card'
  if (kind === 'incident') return 'Incident'
  return 'Stock-take'
}

function kindIcon(kind: PendingUploadItem['kind']) {
  if (kind === 'job_card') return '✓'
  if (kind === 'incident') return '!'
  return '▦'
}

function formatWhen(value?: string) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
}

export function PendingUploadsScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { isOnline } = useNetwork()
  const { setWizardFlow, stockLocations } = useJobCardWizard()
  const {
    pendingUploads,
    pendingAutoSync,
    refreshPendingUploads,
    runSyncNow,
    retryPendingUpload
  } = useJobCardSync()
  const [retryingId, setRetryingId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    void refreshPendingUploads()
  }, [refreshPendingUploads])

  const onRetryOne = useCallback(
    async (item: PendingUploadItem) => {
      if (!isOnline) {
        Alert.alert('Offline', 'Connect to the internet to sync this item.')
        return
      }
      setRetryingId(item.id)
      setErrors((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      try {
        const result = await retryPendingUpload(item)
        if (!result.ok) {
          setErrors((prev) => ({
            ...prev,
            [item.id]: result.errorText || 'Sync failed'
          }))
        } else {
          await refreshPendingUploads()
        }
      } finally {
        setRetryingId('')
      }
    },
    [isOnline, retryPendingUpload, refreshPendingUploads]
  )

  const onSyncAll = useCallback(async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to the internet to sync pending uploads.')
      return
    }
    const result = await runSyncNow()
    await refreshPendingUploads()
    if (result.failed > 0) {
      Alert.alert(
        'Sync incomplete',
        `${result.synced} synced, ${result.failed} still waiting. Tap Retry on any item that failed.`
      )
    }
  }, [isOnline, runSyncNow, refreshPendingUploads])

  const resolveSubtitle = useCallback(
    (item: PendingUploadItem) => {
      if (item.kind !== 'stock_take' || !item.locationId) return item.subtitle
      const location = stockLocations.find((loc) => String(loc.id) === String(item.locationId))
      if (location?.name) return `${item.subtitle} · ${location.name}`
      return item.subtitle
    },
    [stockLocations]
  )

  return (
    <View style={styles.root}>
      <ModuleHeader
        title="Pending uploads"
        subtitle="Waiting to reach the server"
        onBack={() => setWizardFlow('landing')}
      />
      <OfflineBanner visible={!isOnline} />
      <View style={styles.toolbar}>
        <Pressable
          style={[styles.syncAllBtn, (!isOnline || pendingAutoSync) && styles.disabled]}
          disabled={!isOnline || pendingAutoSync || !pendingUploads.length}
          onPress={() => void onSyncAll()}
        >
          <Text style={styles.syncAllText}>
            {pendingAutoSync ? 'Syncing…' : 'Sync all now'}
          </Text>
        </Pressable>
      </View>
      {!pendingUploads.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing waiting</Text>
          <Text style={styles.emptySub}>New offline saves will appear here until they sync.</Text>
        </View>
      ) : (
        <FlatList
          data={pendingUploads}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const busy = retryingId === item.id || pendingAutoSync
            const err = errors[item.id]
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}>
                    <Text style={styles.icon}>{kindIcon(item.kind)}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.kind}>{kindLabel(item.kind)}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.subtitle}>{resolveSubtitle(item)}</Text>
                    <Text style={styles.meta}>Saved {formatWhen(item.savedAt)}</Text>
                    {err ? <Text style={styles.error}>{err}</Text> : null}
                  </View>
                </View>
                <Pressable
                  style={[styles.retryBtn, (busy || !isOnline) && styles.disabled]}
                  disabled={busy || !isOnline}
                  onPress={() => void onRetryOne(item)}
                >
                  {busy ? (
                    <ActivityIndicator color={jc.primaryDark} size="small" />
                  ) : (
                    <Text style={styles.retryText}>Retry</Text>
                  )}
                </Pressable>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: jc.bg },
    toolbar: { paddingHorizontal: 16, paddingBottom: 8 },
    syncAllBtn: {
      backgroundColor: jc.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center'
    },
    syncAllText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    list: { padding: 16, gap: 10, paddingBottom: 32 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: jc.text },
    emptySub: { fontSize: 13, color: jc.textMuted, textAlign: 'center', lineHeight: 20 },
    card: {
      backgroundColor: jc.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: jc.border,
      padding: 14,
      marginBottom: 10,
      gap: 12
    },
    cardTop: { flexDirection: 'row', gap: 12 },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: jc.primarySoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    icon: { color: jc.primaryDark, fontWeight: '800', fontSize: 16 },
    cardBody: { flex: 1, gap: 2 },
    kind: { fontSize: 11, fontWeight: '700', color: jc.primary, textTransform: 'uppercase' },
    title: { fontSize: 15, fontWeight: '700', color: jc.text },
    subtitle: { fontSize: 13, color: jc.text },
    meta: { fontSize: 12, color: jc.textMuted, marginTop: 2 },
    error: { fontSize: 12, color: jc.danger, marginTop: 4 },
    retryBtn: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: jc.primaryMuted,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 72,
      alignItems: 'center'
    },
    retryText: { color: jc.primaryDark, fontWeight: '700', fontSize: 13 },
    disabled: { opacity: 0.5 }
  })
}
