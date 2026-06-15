import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { useNetwork } from '../../hooks/useNetwork'
import {
  cacheCrmClients,
  cacheCrmGroups,
  cacheCrmLeads,
  offlineListMessage,
  readCachedCrmClients,
  readCachedCrmGroups,
  readCachedCrmLeads,
  readRecentCrmEntities,
  type CrmRecentEntry
} from '../../offline/erpReadCaches'
import { useAuth } from '../../state/AuthContext'

import type { RootStackParamList } from '../../navigation/types'
import { crmApi } from '../api'
import { CrmEntityRow } from '../components/CrmEntityRow'
import type { CrmClient, CrmFilterKey, CrmGroup, CrmLead, CrmTab } from '../types'
import {
  entityKindLabel,
  filterClientsList,
  filterEntities,
  normalizeEntity,
  sortByName,
  tabCounts,
  uniqueIndustries
} from '../utils'
import type { CrmStackParamList } from '../navigation'
import { CrmPipelineView } from '../components/CrmPipelineView'
import { isAdmin } from '../../utils/menuAccess'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = NativeStackScreenProps<CrmStackParamList, 'CrmHome'>

const FILTERS: { key: CrmFilterKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'recent', label: 'Recent', icon: 'history' },
  { key: 'active', label: 'Active', icon: 'check-circle' },
  { key: 'starred', label: 'Starred', icon: 'star' }
]

export function CrmHomeScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles)
  const { erp } = useTheme()
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { accessToken, user } = useAuth()
  const { isOnline } = useNetwork()
  const [tab, setTab] = useState<CrmTab>('clients')
  const [recentEntries, setRecentEntries] = useState<CrmRecentEntry[]>([])
  const [clients, setClients] = useState<CrmClient[]>([])
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [groups, setGroups] = useState<CrmGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CrmFilterKey>('all')
  const [industry, setIndustry] = useState('all')
  const [industryPickerOpen, setIndustryPickerOpen] = useState(false)
  const [pipelineCount, setPipelineCount] = useState<number | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) {
        setError('Please sign in again.')
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setError('')

      const applyCached = async () => {
        const [cachedClients, cachedLeads, cachedGroups, recent] = await Promise.all([
          readCachedCrmClients(),
          readCachedCrmLeads(),
          readCachedCrmGroups(),
          readRecentCrmEntities()
        ])
        setRecentEntries(recent || [])
        const hasAny =
          Boolean(cachedClients?.length) ||
          Boolean(cachedLeads?.length) ||
          Boolean(cachedGroups?.length)
        if (hasAny) {
          setClients(cachedClients || [])
          setLeads(cachedLeads || [])
          setGroups(cachedGroups || [])
          return true
        }
        setClients([])
        setLeads([])
        setGroups([])
        setError(offlineListMessage(false))
        return false
      }

      if (!isOnline) {
        await applyCached()
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        const [c, l, g, recent] = await Promise.all([
          crmApi.listClients(accessToken),
          crmApi.listLeads(accessToken),
          crmApi.listGroups(accessToken),
          readRecentCrmEntities()
        ])
        const clients = filterClientsList(c.map(normalizeEntity))
        const leads = l.map(normalizeEntity)
        const groups = g.map(normalizeEntity)
        setClients(clients)
        setLeads(leads)
        setGroups(groups)
        setRecentEntries(recent || [])
        await Promise.all([cacheCrmClients(clients), cacheCrmLeads(leads), cacheCrmGroups(groups)])
      } catch (e) {
        const hadCache = await applyCached()
        if (!hadCache) {
          setError(e instanceof Error ? e.message : 'Could not load CRM data')
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [accessToken, isOnline]
  )

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => tabCounts(clients, leads, groups), [clients, leads, groups])
  const source =
    tab === 'clients' ? clients : tab === 'leads' ? leads : groups
  const industries = useMemo(() => uniqueIndustries(source), [source])
  const showIndustryFilter = industries.length > 2
  const industryLabel =
    industry === 'all' ? 'All industries' : industry

  const filtered = useMemo(() => {
    if (filter === 'recent' && (tab === 'clients' || tab === 'leads')) {
      const kind = tab === 'clients' ? 'client' : 'lead'
      const recentIds = recentEntries
        .filter((row) => row.entityType === kind)
        .map((row) => row.entityId)
      const order = new Map(recentIds.map((id, index) => [id, index]))
      const base = filterEntities(source, query, 'all', industry, tab).filter((item) =>
        order.has(String(item.id))
      )
      return base.sort(
        (a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0)
      )
    }
    return sortByName(filterEntities(source, query, filter, industry, tab))
  }, [source, query, filter, industry, tab, recentEntries])

  const showPipeline = isAdmin(user)

  const homeTabs = useMemo(() => {
    const tabs: CrmTab[] = ['clients', 'leads']
    if (showPipeline) tabs.push('pipeline')
    tabs.push('groups')
    return tabs
  }, [showPipeline])

  const switchTab = (key: CrmTab) => {
    setTab(key)
    setIndustry('all')
    setQuery('')
    setFilter('all')
  }

  const tabMeta = (key: CrmTab) => {
    if (key === 'clients') return { icon: 'building', label: 'Clients', count: counts.clients }
    if (key === 'leads') return { icon: 'user-plus', label: 'Leads', count: counts.leads }
    if (key === 'pipeline') return { icon: 'stream', label: 'Pipeline', count: pipelineCount }
    return { icon: 'layer-group', label: 'Groups', count: counts.groups }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title="CRM"
        subtitle={`${counts.clients} clients · ${counts.leads} leads · ${counts.groups} groups`}
        showNotifications
        onNotificationsPress={() => rootNavigation.navigate('Notifications')}
      />
      <ScreenBody padded={false}>
        <View style={styles.tabBarWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRowScroll}
            keyboardShouldPersistTaps="handled"
          >
            {homeTabs.map((key) => {
              const active = tab === key
              const meta = tabMeta(key)
              return (
                <Pressable
                  key={key}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                  onPress={() => switchTab(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <FontAwesome5
                    name={meta.icon}
                    size={12}
                    color={active ? '#fff' : erp.textMuted}
                    solid={active}
                  />
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                    numberOfLines={1}
                  >
                    {meta.label}
                  </Text>
                  {meta.count != null ? (
                    <View style={[styles.tabCount, active && styles.tabCountActive]}>
                      <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                        {meta.count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {tab === 'pipeline' ? (
          <CrmPipelineView
            accessToken={accessToken}
            active={tab === 'pipeline'}
            onStats={({ count }) => setPipelineCount(count)}
          />
        ) : (
          <View style={styles.listPane}>
        <View style={styles.searchWrap}>
          <View style={styles.searchField}>
            <FontAwesome5 name="search" size={14} color={erp.textSubtle} style={styles.searchIcon} />
            <TextInput
              style={styles.search}
              placeholder={`Search ${tab}…`}
              placeholderTextColor={erp.textSubtle}
              value={query}
              onChangeText={setQuery}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {tab !== 'groups' ? (
          <View style={styles.filterBar}>
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <Pressable
                  key={f.key}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <FontAwesome5
                    name={f.icon}
                    size={11}
                    color={active ? erp.primary : erp.textMuted}
                    solid={f.key === 'starred' && active}
                    style={styles.filterIcon}
                  />
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {showIndustryFilter ? (
          <Pressable
            style={styles.industryBtn}
            onPress={() => setIndustryPickerOpen(true)}
          >
            <FontAwesome5 name="industry" size={12} color={erp.textMuted} style={styles.industryIcon} />
            <Text style={styles.industryBtnText} numberOfLines={1}>
              {industryLabel}
            </Text>
            <FontAwesome5 name="chevron-down" size={10} color={erp.textSubtle} />
          </Pressable>
        ) : null}

        <View style={styles.resultsMeta}>
          <Text style={styles.resultsMetaText}>
            {filtered.length} {entityKindLabel(tab).toLowerCase()}
            {filtered.length === 1 ? '' : 's'}
            {(tab !== 'groups' && (filter !== 'all' || industry !== 'all' || query.trim())) ||
            (tab === 'groups' && (industry !== 'all' || query.trim()))
              ? ' matching filters'
              : ''}
          </Text>
        </View>

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
            style={styles.listFlex}
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
                    entityType:
                      tab === 'clients' ? 'client' : tab === 'leads' ? 'lead' : 'group',
                    entityId: item.id
                  })
                }
              />
            )}
          />
        )}
          </View>
        )}
      </ScreenBody>

      <Modal
        visible={industryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIndustryPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIndustryPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Industry</Text>
            {industries.map((ind) => {
              const active = industry === ind
              const label = ind === 'all' ? 'All industries' : ind
              return (
                <Pressable
                  key={ind}
                  style={[styles.modalRow, active && styles.modalRowActive]}
                  onPress={() => {
                    setIndustry(ind)
                    setIndustryPickerOpen(false)
                  }}
                >
                  <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                    {label}
                  </Text>
                  {active ? (
                    <FontAwesome5 name="check" size={14} color={erp.primary} />
                  ) : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: erp.bg },
    tabBarWrap: {
      flexGrow: 0,
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: erp.borderLight,
      backgroundColor: erp.bg
    },
    tabRowScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: erp.space.lg,
      paddingVertical: 10
    },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      minHeight: 38,
      borderRadius: 999,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border,
      flexShrink: 0
    },
    tabBtnActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    tabText: { fontWeight: '700', color: erp.textMuted, fontSize: 13, flexShrink: 0 },
    tabTextActive: { color: '#fff' },
    tabCount: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: erp.surfaceMuted,
      alignItems: 'center',
      marginLeft: 6
    },
    tabCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    tabCountText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
    tabCountTextActive: { color: '#fff' },
    listPane: { flex: 1 },
    listFlex: { flex: 1 },
    searchWrap: { paddingHorizontal: erp.space.lg, paddingTop: 10, paddingBottom: 8 },
    searchField: { position: 'relative', justifyContent: 'center' },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
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
    filterBar: {
      flexDirection: 'row',
      marginHorizontal: erp.space.lg,
      marginBottom: 8,
      padding: 4,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surfaceMuted,
      borderWidth: 1,
      borderColor: erp.border
    },
    filterBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: erp.radius.sm
    },
    filterBtnActive: {
      backgroundColor: erp.surface,
      ...erp.shadowSm
    },
    filterIcon: { marginRight: 5 },
    filterText: { fontSize: 13, fontWeight: '700', color: erp.textMuted },
    filterTextActive: { color: erp.primary },
    industryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: erp.space.lg,
      marginBottom: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border
    },
    industryIcon: { marginRight: 8 },
    industryBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: erp.text },
    resultsMeta: {
      paddingHorizontal: erp.space.lg,
      paddingBottom: 8
    },
    resultsMetaText: { fontSize: 12, fontWeight: '600', color: erp.textSubtle },
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
    emptySub: { fontSize: 14, color: erp.textMuted, textAlign: 'center' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'flex-end'
    },
    modalSheet: {
      backgroundColor: erp.surface,
      borderTopLeftRadius: erp.radius.xl,
      borderTopRightRadius: erp.radius.xl,
      paddingTop: 16,
      paddingBottom: 28,
      maxHeight: '60%'
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: erp.text,
      paddingHorizontal: erp.space.lg,
      marginBottom: 8
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: erp.space.lg,
      borderBottomWidth: 1,
      borderBottomColor: erp.borderLight
    },
    modalRowActive: { backgroundColor: erp.primarySoft },
    modalRowText: { fontSize: 15, fontWeight: '600', color: erp.text, flex: 1 },
    modalRowTextActive: { color: erp.primary, fontWeight: '700' }
  })
}
