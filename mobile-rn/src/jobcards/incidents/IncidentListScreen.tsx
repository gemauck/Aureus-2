import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { useJobCardWizard } from '../WizardContext'
import { incidentApi, type IncidentReport } from './incidentApi'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

function formatWhen(value?: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
}

function statusLabel(status: string) {
  const s = String(status || 'draft').toLowerCase().replace(/\s+/g, '_')
  const map: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_investigation: 'Under investigation',
    closed: 'Closed'
  }
  return map[s] || status || 'Draft'
}

export function IncidentListScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const { setWizardFlow, openIncidentReport, openIncidentForEdit } = useJobCardWizard()
  const [rows, setRows] = useState<IncidentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    if (!isOnline) {
      setError('Connect to the internet to load incident reports.')
      setRows([])
      return
    }
    setError('')
    try {
      const res = await incidentApi.list(accessToken, { mine: '1' })
      setRows(res.incidentReports || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load incidents')
    }
  }, [accessToken, isOnline])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      await load()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  return (
    <View style={styles.root}>
      <ModuleHeader
        title="Incident reports"
        subtitle="Service & Maintenance"
        onBack={() => setWizardFlow('landing')}
      />
      <OfflineBanner visible={!isOnline} />
      <View style={styles.toolbar}>
        <Pressable style={styles.newBtn} onPress={() => openIncidentReport()}>
          <Text style={styles.newBtnText}>+ New incident</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={jc.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void onRefresh()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={rows.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No incident reports yet</Text>
              <Text style={styles.emptySub}>Tap “New incident” to record a site incident.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openIncidentForEdit(item.id)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.incidentNumber || item.id}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>
                {[item.clientName, item.incidentType, item.severity].filter(Boolean).join(' · ') || '—'}
              </Text>
              {item.siteName ? <Text style={styles.cardMeta}>{item.siteName}</Text> : null}
              <Text style={styles.cardMeta}>{formatWhen(item.incidentAt || item.createdAt)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: jc.background },
    toolbar: { paddingHorizontal: 16, paddingVertical: 10 },
    newBtn: {
      backgroundColor: jc.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center'
    },
    newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    list: { padding: 16, gap: 10, paddingBottom: 32 },
    listEmpty: { flexGrow: 1, padding: 16 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    error: { color: jc.danger, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8
    },
    retryText: { color: jc.text, fontWeight: '600' },
    empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: jc.text },
    emptySub: { fontSize: 13, color: jc.textMuted, textAlign: 'center' },
    card: {
      backgroundColor: jc.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: jc.border,
      padding: 14,
      marginBottom: 10,
      gap: 4
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: jc.text, flex: 1 },
    badge: {
      backgroundColor: jc.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3
    },
    badgeText: { fontSize: 10, fontWeight: '700', color: jc.primaryDark },
    cardSub: { fontSize: 13, color: jc.text, marginTop: 2 },
    cardMeta: { fontSize: 12, color: jc.textMuted }
  })
}
