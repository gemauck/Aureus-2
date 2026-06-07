import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { AIDA_STAGES, ENGAGEMENT_STAGES, PIPELINE_TYPE_FILTERS } from '../pipeline/constants'
import { usePipelineData } from '../pipeline/usePipelineData'
import type { PipelineItem } from '../pipeline/types'
import { formatMoney } from '../utils'
import type { CrmStackParamList } from '../navigation'
import { CrmPipelineFunnel } from './CrmPipelineFunnel'
import { CrmPipelineCard } from './CrmPipelineCard'
import { CrmPipelineKanban } from './CrmPipelineKanban'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  accessToken: string | null | undefined
  active: boolean
  onStats?: (stats: { count: number; value: number }) => void
}

const DEFAULT_FILTERS = {
  search: '',
  industry: 'all',
  engagementStage: 'all',
  aidaStatus: 'all',
  type: 'all',
  starredOnly: false
}

type FilterPicker = 'industry' | 'aida' | 'engagement' | 'type' | null

export function CrmPipelineView({ accessToken, active, onStats }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<CrmStackParamList>>()
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [filterPicker, setFilterPicker] = useState<FilterPicker>(null)

  const {
    loading,
    refreshing,
    error,
    filters,
    setFilters,
    viewMode,
    setViewMode,
    kanbanGroupBy,
    setKanbanGroupBy,
    listRows,
    kanbanItems,
    industries,
    metrics,
    load,
    setRefreshing,
    saveAidaStage,
    saveEngagementStage
  } = usePipelineData(accessToken, active)

  useEffect(() => {
    onStats?.({ count: metrics.totalCount, value: metrics.totalValue })
  }, [metrics.totalCount, metrics.totalValue, onStats])

  const hasActiveFilters = useMemo(
    () =>
      Boolean(filters.search.trim()) ||
      filters.starredOnly ||
      filters.industry !== 'all' ||
      filters.aidaStatus !== 'all' ||
      filters.engagementStage !== 'all' ||
      filters.type !== 'all',
    [filters]
  )

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const toggleAidaFilter = (stage: string) => {
    setFilters((prev) => ({
      ...prev,
      aidaStatus: prev.aidaStatus === stage ? 'all' : stage
    }))
  }

  const refresh = useCallback(() => {
    setRefreshing(true)
    void load(true, true)
  }, [load, setRefreshing])

  const openItem = useCallback(
    (item: PipelineItem) => {
      if (item.type === 'lead') {
        navigation.navigate('CrmDetail', { entityType: 'lead', entityId: item.id })
        return
      }
      if (item.type === 'opportunity' && item.clientId) {
        navigation.navigate('CrmDetail', {
          entityType: 'client',
          entityId: item.clientId,
          initialTab: 'opportunities'
        })
        return
      }
      if (item.type === 'site') {
        if (item.leadId) {
          navigation.navigate('CrmDetail', { entityType: 'lead', entityId: String(item.leadId) })
        } else if (item.clientId) {
          navigation.navigate('CrmDetail', {
            entityType: 'client',
            entityId: String(item.clientId),
            initialTab: 'sites'
          })
        }
        return
      }
      if (item.type === 'client' && item.client) {
        navigation.navigate('CrmDetail', { entityType: 'client', entityId: String(item.client.id) })
      }
    },
    [navigation]
  )

  const filterLabel = (key: FilterPicker) => {
    if (key === 'industry') return filters.industry === 'all' ? 'All industries' : filters.industry
    if (key === 'aida') return filters.aidaStatus === 'all' ? 'All AIDA' : filters.aidaStatus
    if (key === 'engagement')
      return filters.engagementStage === 'all' ? 'All engagement' : filters.engagementStage
    if (key === 'type') {
      return PIPELINE_TYPE_FILTERS.find((f) => f.key === filters.type)?.label || 'All types'
    }
    return ''
  }

  const header = (
    <>
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricCardPrimary]}>
          <FontAwesome5 name="stream" size={14} color={erp.primary} style={styles.metricIcon} />
          <Text style={styles.metricValue}>{metrics.totalCount}</Text>
          <Text style={styles.metricLabel}>In pipeline</Text>
        </View>
        <View style={styles.metricCard}>
          <FontAwesome5 name="coins" size={14} color={erp.success} style={styles.metricIcon} />
          <Text style={[styles.metricValue, styles.metricValueMoney]}>
            {formatMoney(metrics.totalValue) || 'R 0'}
          </Text>
          <Text style={styles.metricLabel}>Total value</Text>
        </View>
      </View>

      <CrmPipelineFunnel
        byAida={metrics.byAida}
        activeStage={filters.aidaStatus !== 'all' ? filters.aidaStatus : undefined}
        onStagePress={toggleAidaFilter}
      />

      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
          onPress={() => setViewMode('list')}
        >
          <FontAwesome5
            name="list"
            size={12}
            color={viewMode === 'list' ? '#fff' : erp.textMuted}
            style={styles.toggleIcon}
          />
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, viewMode === 'kanban' && styles.toggleBtnActive]}
          onPress={() => setViewMode('kanban')}
        >
          <FontAwesome5
            name="columns"
            size={12}
            color={viewMode === 'kanban' ? '#fff' : erp.textMuted}
            style={styles.toggleIcon}
          />
          <Text style={[styles.toggleText, viewMode === 'kanban' && styles.toggleTextActive]}>
            Kanban
          </Text>
        </Pressable>
      </View>

      {viewMode === 'kanban' ? (
        <View style={styles.groupByRow}>
          <Text style={styles.groupByLabel}>Group by</Text>
          <Pressable
            style={[styles.groupChip, kanbanGroupBy === 'aidaStatus' && styles.groupChipActive]}
            onPress={() => setKanbanGroupBy('aidaStatus')}
          >
            <Text
              style={[
                styles.groupChipText,
                kanbanGroupBy === 'aidaStatus' && styles.groupChipTextActive
              ]}
            >
              AIDA
            </Text>
          </Pressable>
          <Pressable
            style={[styles.groupChip, kanbanGroupBy === 'engagementStage' && styles.groupChipActive]}
            onPress={() => setKanbanGroupBy('engagementStage')}
          >
            <Text
              style={[
                styles.groupChipText,
                kanbanGroupBy === 'engagementStage' && styles.groupChipTextActive
              ]}
            >
              Engagement
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <FontAwesome5 name="search" size={14} color={erp.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search pipeline…"
          placeholderTextColor={erp.textSubtle}
          value={filters.search}
          onChangeText={(search) => setFilters((prev) => ({ ...prev, search }))}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          style={[styles.filterChip, filters.starredOnly && styles.filterChipActive]}
          onPress={() => setFilters((prev) => ({ ...prev, starredOnly: !prev.starredOnly }))}
        >
          <FontAwesome5
            name="star"
            size={10}
            solid={filters.starredOnly}
            color={filters.starredOnly ? erp.primary : erp.textMuted}
          />
          <Text style={[styles.filterChipText, filters.starredOnly && styles.filterChipTextActive]}>
            Starred
          </Text>
        </Pressable>
        {(['type', 'aida', 'engagement', 'industry'] as FilterPicker[]).map((key) =>
          key ? (
            <Pressable key={key} style={styles.filterChip} onPress={() => setFilterPicker(key)}>
              <Text style={styles.filterChipText} numberOfLines={1}>
                {filterLabel(key)}
              </Text>
              <FontAwesome5 name="chevron-down" size={8} color={erp.textSubtle} />
            </Pressable>
          ) : null
        )}
        {hasActiveFilters ? (
          <Pressable style={styles.clearChip} onPress={clearFilters}>
            <FontAwesome5 name="times" size={10} color={erp.danger} />
            <Text style={styles.clearChipText}>Clear</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Text style={styles.resultsMeta}>
        {viewMode === 'list' ? listRows.length : kanbanItems.length} items
        {hasActiveFilters ? ' · filtered' : ''}
      </Text>
    </>
  )

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={erp.primary} />
        <Text style={styles.loadingText}>Loading pipeline…</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <FontAwesome5 name="exclamation-circle" size={28} color={erp.danger} />
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load(false, true)}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {viewMode === 'kanban' ? (
        <>
          <View style={styles.headerPane}>{header}</View>
          <CrmPipelineKanban
            items={kanbanItems}
            groupBy={kanbanGroupBy}
            onItemPress={openItem}
            onAidaChange={(item, stage) => saveAidaStage(item, stage)}
            onEngagementChange={(item, status) => saveEngagementStage(item, status)}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={erp.primary} />
          }
        >
          {header}
          {listRows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <FontAwesome5 name="stream" size={32} color={erp.textSubtle} />
              <Text style={styles.emptyTitle}>No pipeline items</Text>
              <Text style={styles.emptySub}>
                {hasActiveFilters
                  ? 'Try clearing filters or pull down to refresh.'
                  : 'Pull down to refresh or add leads and opportunities in the ERP.'}
              </Text>
              {hasActiveFilters ? (
                <Pressable style={styles.emptyBtn} onPress={clearFilters}>
                  <Text style={styles.emptyBtnText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.listPane}>
              {listRows.map((row) => (
                <CrmPipelineCard
                  key={`${row.item.type}-${row.item.id}-${row.isNested ? 'n' : 'p'}`}
                  item={row.item}
                  isNested={row.isNested}
                  parentLabel={row.parentLabel}
                  onPress={() => openItem(row.item)}
                  onAidaChange={(stage) => saveAidaStage(row.item, stage)}
                  onEngagementChange={(status) => saveEngagementStage(row.item, status)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={filterPicker != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterPicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Filter</Text>
            {filterPicker === 'industry'
              ? industries.map((ind) => {
                  const active = filters.industry === ind
                  const label = ind === 'all' ? 'All industries' : ind
                  return (
                    <Pressable
                      key={ind}
                      style={[styles.modalRow, active && styles.modalRowActive]}
                      onPress={() => {
                        setFilters((prev) => ({ ...prev, industry: ind }))
                        setFilterPicker(null)
                      }}
                    >
                      <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                        {label}
                      </Text>
                      {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                    </Pressable>
                  )
                })
              : null}
            {filterPicker === 'aida'
              ? ['all', ...AIDA_STAGES].map((stage) => {
                  const active = filters.aidaStatus === stage
                  const label = stage === 'all' ? 'All AIDA stages' : stage
                  return (
                    <Pressable
                      key={stage}
                      style={[styles.modalRow, active && styles.modalRowActive]}
                      onPress={() => {
                        setFilters((prev) => ({ ...prev, aidaStatus: stage }))
                        setFilterPicker(null)
                      }}
                    >
                      <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                        {label}
                      </Text>
                      {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                    </Pressable>
                  )
                })
              : null}
            {filterPicker === 'engagement'
              ? ['all', ...ENGAGEMENT_STAGES].map((stage) => {
                  const active = filters.engagementStage === stage
                  const label = stage === 'all' ? 'All engagement stages' : stage
                  return (
                    <Pressable
                      key={stage}
                      style={[styles.modalRow, active && styles.modalRowActive]}
                      onPress={() => {
                        setFilters((prev) => ({ ...prev, engagementStage: stage }))
                        setFilterPicker(null)
                      }}
                    >
                      <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                        {label}
                      </Text>
                      {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                    </Pressable>
                  )
                })
              : null}
            {filterPicker === 'type'
              ? PIPELINE_TYPE_FILTERS.map((f) => {
                  const active = filters.type === f.key
                  return (
                    <Pressable
                      key={f.key}
                      style={[styles.modalRow, active && styles.modalRowActive]}
                      onPress={() => {
                        setFilters((prev) => ({ ...prev, type: f.key }))
                        setFilterPicker(null)
                      }}
                    >
                      <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                        {f.label}
                      </Text>
                      {active ? <FontAwesome5 name="check" size={14} color={erp.primary} /> : null}
                    </Pressable>
                  )
                })
              : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    root: { flex: 1 },
    headerPane: { flexShrink: 0 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 28 },
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
    metricsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: erp.space.lg,
      paddingTop: 8,
      paddingBottom: 4
    },
    metricCard: {
      flex: 1,
      backgroundColor: erp.surface,
      borderRadius: erp.radius.md,
      padding: 12,
      borderWidth: 1,
      borderColor: erp.border
    },
    metricCardPrimary: { borderColor: erp.primarySoft, backgroundColor: erp.primarySoft },
    metricIcon: { marginBottom: 6 },
    metricValue: { fontSize: 20, fontWeight: '800', color: erp.text },
    metricValueMoney: { fontSize: 17 },
    metricLabel: { fontSize: 11, fontWeight: '600', color: erp.textMuted, marginTop: 2 },
    viewToggle: {
      flexDirection: 'row',
      marginHorizontal: erp.space.lg,
      marginTop: 8,
      marginBottom: 4,
      padding: 4,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surfaceMuted,
      borderWidth: 1,
      borderColor: erp.border
    },
    toggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: erp.radius.sm
    },
    toggleBtnActive: { backgroundColor: erp.primary },
    toggleIcon: { marginRight: 6 },
    toggleText: { fontSize: 13, fontWeight: '700', color: erp.textMuted },
    toggleTextActive: { color: '#fff' },
    groupByRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: erp.space.lg,
      paddingBottom: 6,
      gap: 8
    },
    groupByLabel: { fontSize: 12, fontWeight: '700', color: erp.textMuted, marginRight: 4 },
    groupChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: erp.border,
      backgroundColor: erp.surface
    },
    groupChipActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
    groupChipText: { fontSize: 12, fontWeight: '700', color: erp.textMuted },
    groupChipTextActive: { color: erp.primary },
    searchWrap: {
      position: 'relative',
      marginHorizontal: erp.space.lg,
      marginTop: 6,
      marginBottom: 8,
      justifyContent: 'center'
    },
    searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
    search: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: erp.radius.md,
      paddingVertical: 11,
      paddingLeft: 38,
      paddingRight: 14,
      backgroundColor: erp.surface,
      fontSize: 15,
      color: erp.text
    },
    filterScroll: {
      paddingHorizontal: erp.space.lg,
      paddingBottom: 8,
      gap: 8,
      flexDirection: 'row',
      alignItems: 'center'
    },
    filterChip: {
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
    filterChipActive: { backgroundColor: erp.primarySoft, borderColor: erp.primary },
    filterChipText: { fontSize: 12, fontWeight: '700', color: erp.textMuted, maxWidth: 140 },
    filterChipTextActive: { color: erp.primary },
    clearChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: '#fef2f2',
      borderWidth: 1,
      borderColor: '#fecaca'
    },
    clearChipText: { fontSize: 12, fontWeight: '700', color: erp.danger },
    resultsMeta: {
      paddingHorizontal: erp.space.lg,
      paddingBottom: 8,
      fontSize: 12,
      fontWeight: '600',
      color: erp.textSubtle
    },
    listPane: { paddingHorizontal: erp.space.lg },
    emptyWrap: { alignItems: 'center', padding: 40, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: erp.text },
    emptySub: { fontSize: 14, color: erp.textMuted, textAlign: 'center', paddingHorizontal: 24 },
    emptyBtn: {
      marginTop: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: erp.radius.md,
      backgroundColor: erp.primary
    },
    emptyBtnText: { color: '#fff', fontWeight: '800' },
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
      maxHeight: '70%'
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
