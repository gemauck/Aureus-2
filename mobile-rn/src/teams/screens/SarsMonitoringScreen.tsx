import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { ModuleHeader } from '../../components/shell/ModuleHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'
import { teamsApi } from '../api'
import type { TeamsStackParamList } from '../navigation'
import type { SarsChange, SarsStats } from '../types'
import { formatRelative } from '../utils'

type Props = NativeStackScreenProps<TeamsStackParamList, 'SarsMonitoring'>

export function SarsMonitoringScreen({ navigation }: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { accessToken } = useAuth()
  const [changes, setChanges] = useState<SarsChange[]>([])
  const [stats, setStats] = useState<SarsStats>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [filter, setFilter] = useState<'all' | 'new' | 'unread'>('all')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return
      if (!silent) setLoading(true)
      try {
        const filters =
          filter === 'new'
            ? { isNew: true }
            : filter === 'unread'
              ? { isRead: false }
              : undefined
        const [list, s] = await Promise.all([
          teamsApi.listSarsChanges(accessToken, filters),
          teamsApi.getSarsStats(accessToken)
        ])
        setChanges(list)
        setStats(s)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, filter]
  )

  useEffect(() => {
    void load()
  }, [load])

  const runCheck = async () => {
    if (!accessToken || checking) return
    setChecking(true)
    try {
      await teamsApi.triggerSarsCheck(accessToken)
      await load(true)
    } finally {
      setChecking(false)
    }
  }

  const markRead = async (ids: string[]) => {
    if (!accessToken || !ids.length) return
    await teamsApi.markSarsRead(accessToken, ids)
    void load(true)
  }

  return (
    <View style={styles.root}>
      <ModuleHeader title="SARS Monitoring" subtitle="Website change tracking" showBack onBack={() => navigation.goBack()} />
      <ScreenBody padded={false}>
        <View style={styles.statsRow}>
          <Stat label="Total" value={stats.total ?? 0} />
          <Stat label="New" value={stats.new ?? 0} accent={erp.warning} />
          <Stat label="Unread" value={stats.unread ?? 0} accent={erp.primary} />
        </View>
        <View style={styles.filters}>
          {(['all', 'new', 'unread'] as const).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterChip, filter === f && styles.filterActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'all' ? 'All' : f === 'new' ? 'New' : 'Unread'}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.checkBtn} onPress={() => void runCheck()} disabled={checking}>
            <Text style={styles.checkText}>{checking ? 'Checking…' : 'Check now'}</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={erp.primary} />
        ) : (
          <FlatList
            data={changes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} />
            }
            ListEmptyComponent={<Text style={styles.empty}>No changes found.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.isRead === false && styles.rowUnread]}
                onPress={() => {
                  if (item.url) void Linking.openURL(item.url)
                  if (!item.isRead) void markRead([item.id])
                }}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title || 'Untitled change'}</Text>
                {item.summary ? <Text style={styles.rowSummary} numberOfLines={3}>{item.summary}</Text> : null}
                <Text style={styles.rowMeta}>
                  {[item.category, item.priority].filter(Boolean).join(' · ')}
                  {item.detectedAt || item.createdAt
                    ? ` · ${formatRelative(item.detectedAt || item.createdAt)}`
                    : ''}
                </Text>
              </Pressable>
            )}
          />
        )}
      </ScreenBody>
    </View>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent ? { color: accent } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    statsRow: { flexDirection: 'row', padding: erp.space.md, gap: 10 },
    stat: {
      flex: 1,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.md,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: erp.border
    },
    statValue: { fontSize: 22, fontWeight: '800', color: erp.text },
    statLabel: { fontSize: 12, color: erp.textMuted, marginTop: 2 },
    filters: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: erp.space.md,
      gap: 8,
      marginBottom: 8
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    filterActive: { borderColor: erp.primary, backgroundColor: `${erp.primary}18` },
    filterText: { fontSize: 13, color: erp.textMuted },
    filterTextActive: { color: erp.primary, fontWeight: '600' },
    checkBtn: {
      marginLeft: 'auto',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: erp.primary
    },
    checkText: { fontSize: 13, color: '#fff', fontWeight: '600' },
    loader: { marginTop: 24 },
    list: { paddingHorizontal: erp.space.md, paddingBottom: 24, gap: 8 },
    empty: { textAlign: 'center', color: erp.textMuted, marginTop: 24 },
    row: {
      backgroundColor: erp.surface,
      borderRadius: erp.radius.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: erp.border
    },
    rowUnread: { borderColor: `${erp.primary}66` },
    rowTitle: { fontSize: 15, fontWeight: '600', color: erp.text },
    rowSummary: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
    rowMeta: { fontSize: 12, color: erp.textSubtle, marginTop: 6 }
  })
}
