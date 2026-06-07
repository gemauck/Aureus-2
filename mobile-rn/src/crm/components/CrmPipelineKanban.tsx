import React from 'react'
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AIDA_STAGES, AIDA_STAGE_COLORS, ENGAGEMENT_STAGES, ENGAGEMENT_STAGE_COLORS } from '../pipeline/constants'
import type { PipelineItem, PipelineKanbanGroupBy } from '../pipeline/types'
import { normalizeLifecycleStage, normalizeStageToAida } from '../pipeline/utils'
import { formatMoney } from '../utils'
import { CrmPipelineCard } from './CrmPipelineCard'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  items: PipelineItem[]
  groupBy: PipelineKanbanGroupBy
  onItemPress: (item: PipelineItem) => void
  onAidaChange: (item: PipelineItem, stage: string) => void | Promise<void>
  onEngagementChange: (item: PipelineItem, status: string) => void | Promise<void>
  onRefresh?: () => void
  refreshing?: boolean
}

export function CrmPipelineKanban({
  items,
  groupBy,
  onItemPress,
  onAidaChange,
  onEngagementChange,
  onRefresh,
  refreshing
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const columns =
    groupBy === 'aidaStatus'
      ? AIDA_STAGES.map((name) => ({ id: name, name, colors: AIDA_STAGE_COLORS[name] }))
      : ENGAGEMENT_STAGES.map((name) => ({
          id: name,
          name,
          colors: ENGAGEMENT_STAGE_COLORS[name]
        }))

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rowScroll}
      contentContainerStyle={styles.row}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={erp.primary} />
        ) : undefined
      }
    >
      {columns.map((column) => {
        const columnItems = items.filter((item) => {
          if (groupBy === 'aidaStatus') {
            return normalizeStageToAida(item.aidaStatus ?? item.stage) === column.name
          }
          return (
            normalizeLifecycleStage(item.engagementStage ?? item.status ?? 'Potential') === column.name
          )
        })
        const columnValue = columnItems.reduce((sum, item) => sum + (item.value || 0), 0)
        return (
          <View key={column.id} style={styles.column}>
            <View
              style={[
                styles.columnHeader,
                {
                  backgroundColor: column.colors?.bg || '#f3f4f6',
                  borderColor: (column.colors as { border?: string })?.border || '#e5e7eb'
                }
              ]}
            >
              <View style={styles.columnHeaderMain}>
                <Text style={[styles.columnTitle, { color: column.colors?.fg || '#374151' }]}>
                  {column.name}
                </Text>
                {columnValue > 0 ? (
                  <Text style={[styles.columnValue, { color: column.colors?.fg || '#374151' }]}>
                    {formatMoney(columnValue)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{columnItems.length}</Text>
              </View>
            </View>
            <FlatList
              data={columnItems}
              keyExtractor={(item) => `${item.type}-${item.id}`}
              style={styles.columnList}
              contentContainerStyle={styles.columnContent}
              nestedScrollEnabled
              ListEmptyComponent={
                <View style={styles.emptyCol}>
                  <Text style={styles.emptyColText}>Drop items here</Text>
                </View>
              }
              renderItem={({ item }) => (
                <CrmPipelineCard
                  item={item}
                  compact
                  onPress={() => onItemPress(item)}
                  onAidaChange={(stage) => onAidaChange(item, stage)}
                  onEngagementChange={(status) => onEngagementChange(item, status)}
                />
              )}
            />
          </View>
        )
      })}
    </ScrollView>
  )
}

function createStyles({ erp }: { erp: ErpTheme }) {
  return StyleSheet.create({
    rowScroll: { flex: 1 },
    row: { paddingHorizontal: erp.space.lg, paddingBottom: 24, gap: 12, alignItems: 'stretch' },
    column: {
      width: 288,
      flex: 1,
      borderRadius: erp.radius.md,
      backgroundColor: erp.surfaceMuted,
      borderWidth: 1,
      borderColor: erp.border,
      overflow: 'hidden'
    },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      gap: 8
    },
    columnHeaderMain: { flex: 1, minWidth: 0 },
    columnTitle: { fontSize: 13, fontWeight: '800' },
    columnValue: { fontSize: 11, fontWeight: '700', marginTop: 3, opacity: 0.9 },
    countPill: {
      minWidth: 24,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.75)',
      alignItems: 'center'
    },
    countText: { fontSize: 11, fontWeight: '800', color: erp.textMuted },
    columnList: { flex: 1 },
    columnContent: { padding: 10, paddingBottom: 16, flexGrow: 1 },
    emptyCol: { paddingVertical: 28, alignItems: 'center' },
    emptyColText: { fontSize: 12, color: erp.textSubtle, fontWeight: '600' }
  })
}
