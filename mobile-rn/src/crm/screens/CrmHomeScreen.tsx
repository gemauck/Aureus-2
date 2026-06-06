import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { FontAwesome5 } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppHeader } from '../../components/shell/AppHeader'
import { ScreenBody } from '../../components/shell/ScreenBody'
import { useAuth } from '../../state/AuthContext'

import type { RootStackParamList } from '../../navigation/types'
import { crmApi } from '../api'
import { CrmEntityRow } from '../components/CrmEntityRow'
import type { CrmClient, CrmFilterKey, CrmLead, CrmTab } from '../types'
import { filterEntities, tabCounts, uniqueIndustries } from '../utils'
import type { CrmStackParamList } from '../navigation'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<CrmStackParamList, 'CrmHome'>

const FILTERS: { key: CrmFilterKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'active', label: 'Active', icon: 'check-circle' },
  { key: 'starred', label: 'Starred', icon: 'star' }
]

export function CrmHomeScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { accessToken } = useAuth()
  const [tab, setTab] = useState<CrmTab>('clients')
  const [clients, setClients] = useState<CrmClient[]>([])
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CrmFilterKey>('all')
  const [industry, setIndustry] = useState('all')

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setError('Please sign in again.')
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')
      try {
        const [c, l] = await Promise.all([
          crmApi.listClients(accessToken),
          crmApi.listLeads(accessToken)
        ])
        setClients(c)
        setLeads(l)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load CRM data')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => tabCounts(clients, leads), [clients, leads])
  const source = tab === 'clients' ? clients : leads
  const industries = useMemo(() => uniqueIndustries(source), [source])
  const filtered = useMemo(
    () => filterEntities(source, query, filter, industry),
    [source, query, filter, industry]
  )

  return (
    <View style={styles.root}>
      <AppHeader
        title="CRM"
        subtitle="Clients, leads & pipeline"
        showNotifications
        onNotificationsPress={() => rootNavigation.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.hero}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{counts.clients}</Text>
              <Text style={styles.statLbl}>Clients</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{counts.leads}</Text>
              <Text style={styles.statLbl}>Leads</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{filtered.length}</Text>
              <Text style={styles.statLbl}>Showing</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          {(['clients', 'leads'] as CrmTab[]).map((key) => {
            const active = tab === key
            return (
              <Pressable
                key={key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => {
                  setTab(key)
                  setIndustry('all')
                }}
              >
                <FontAwesome5
                  name={key === 'clients' ? 'building' : 'user-plus'}
                  size={14}
                  color={active ? '#fff' : erp.textMuted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key === 'clients' ? 'Clients' : 'Leads'}
                </Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                    {key === 'clients' ? counts.clients : counts.leads}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.searchWrap}>
          <FontAwesome5 name="search" size={14} color={erp.textSubtle} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder={`Search ${tab}…`}
            placeholderTextColor={erp.textSubtle}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <Pressable
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.key)}
              >
                <FontAwesome5
                  name={f.icon}
                  size={11}
                  color={active ? erp.primary : erp.textMuted}
                  solid={f.key === 'starred' && active}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            )
          })}
          {industries.length > 2 ? (
            <>
              <View style={styles.chipDivider} />
              {industries.slice(0, 8).map((ind) => {
                const active = industry === ind
                return (
                  <Pressable
                    key={ind}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setIndustry(ind)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {ind === 'all' ? 'All industries' : ind}
                    </Text>
                  </Pressable>
                )
              })}
            </>
          ) : null}
        </ScrollView>

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={erp.primary} />
            <Text style={styles.loadingText}>Loading {tab}…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <FontAwesome5 name="exclamation-circle" size={28} color={erp.danger} />
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void load(true)
                }}
                tintColor={erp.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <FontAwesome5 name="inbox" size={32} color={erp.textSubtle} />
                <Text style={styles.emptyTitle}>No {tab} match</Text>
                <Text style={styles.emptySub}>Try clearing filters or pull to refresh.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <CrmEntityRow
                entity={item}
                tab={tab}
                onPress={() =>
                  navigation.navigate('CrmDetail', {
                    entityType: tab === 'clients' ? 'client' : 'lead',
                    entityId: item.id
                  })
                }
              />
            )}
          />
        )}
      </ScreenBody>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg },
  hero: {
    marginHorizontal: erp.space.lg,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: erp.sidebar,
    borderRadius: erp.radius.lg,
    padding: 16,
    ...erp.shadowSm
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLbl: { fontSize: 12, color: erp.sidebarTextMuted, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.12)' },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: erp.space.lg,
    paddingTop: 12,
    paddingBottom: 8
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: erp.radius.md,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  tabBtnActive: { backgroundColor: erp.primary, borderColor: erp.primary },
  tabText: { fontWeight: '700', color: erp.textMuted, fontSize: 14 },
  tabTextActive: { color: '#fff' },
  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: erp.surfaceMuted,
    alignItems: 'center'
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
  tabCountTextActive: { color: '#fff' },
  searchWrap: { paddingHorizontal: erp.space.lg, paddingBottom: 8, position: 'relative' },
  searchIcon: { position: 'absolute', left: 28, top: 15, zIndex: 1 },
  search: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingVertical: 12,
    paddingLeft: 38,
    paddingRight: 14,
    backgroundColor: erp.surface,
    fontSize: 16,
    color: erp.text
  },
  chipsRow: { paddingHorizontal: erp.space.lg, paddingBottom: 10, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: erp.surface,
    borderWidth: 1,
    borderColor: erp.border
  },
  chipActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
  chipTextActive: { color: erp.primary },
  chipDivider: { width: 1, height: 20, backgroundColor: erp.border, marginHorizontal: 4 },
  list: { paddingHorizontal: erp.space.lg, paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  loadingText: { color: erp.textMuted, fontWeight: '600' },
  error: { color: erp.danger, fontWeight: '700', textAlign: 'center' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: erp.radius.md,
    backgroundColor: erp.primary
  },
  retryText: { color: '#fff', fontWeight: '800' },
  emptyWrap: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: erp.text },
  emptySub: { fontSize: 14, color: erp.textMuted, textAlign: 'center' }
  })
}