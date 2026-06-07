import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
  const [groups, setGroups] = useState<CrmGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CrmFilterKey>('all')
  const [industry, setIndustry] = useState('all')
  const [industryPickerOpen, setIndustryPickerOpen] = useState(false)

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
        const [c, l, g] = await Promise.all([
          crmApi.listClients(accessToken),
          crmApi.listLeads(accessToken),
          crmApi.listGroups(accessToken)
        ])
        setClients(filterClientsList(c.map(normalizeEntity)))
        setLeads(l.map(normalizeEntity))
        setGroups(g.map(normalizeEntity))
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

  const counts = useMemo(() => tabCounts(clients, leads, groups), [clients, leads, groups])
  const source =
    tab === 'clients' ? clients : tab === 'leads' ? leads : groups
  const industries = useMemo(() => uniqueIndustries(source), [source])
  const showIndustryFilter = industries.length > 2
  const industryLabel =
    industry === 'all' ? 'All industries' : industry

  const filtered = useMemo(
    () => sortByName(filterEntities(source, query, filter, industry, tab)),
    [source, query, filter, industry, tab]
  )

  const switchTab = (key: CrmTab) => {
    setTab(key)
    setIndustry('all')
    setQuery('')
    setFilter('all')
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
        <View style={styles.tabRow}>
          {(['clients', 'leads', 'groups'] as CrmTab[]).map((key) => {
            const active = tab === key
            const count =
              key === 'clients' ? counts.clients : key === 'leads' ? counts.leads : counts.groups
            const icon =
              key === 'clients' ? 'building' : key === 'leads' ? 'user-plus' : 'layer-group'
            const label = key === 'clients' ? 'Clients' : key === 'leads' ? 'Leads' : 'Groups'
            return (
              <Pressable
                key={key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => switchTab(key)}
              >
                <FontAwesome5
                  name={icon}
                  size={13}
                  color={active ? '#fff' : erp.textMuted}
                  style={styles.tabIcon}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

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
    tabRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: erp.space.lg,
      paddingTop: 10,
      paddingBottom: 4
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surface,
      borderWidth: 1,
      borderColor: erp.border
    },
    tabBtnActive: { backgroundColor: erp.primary, borderColor: erp.primary },
    tabIcon: { marginRight: 6 },
    tabText: { fontWeight: '700', color: erp.textMuted, fontSize: 13 },
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
