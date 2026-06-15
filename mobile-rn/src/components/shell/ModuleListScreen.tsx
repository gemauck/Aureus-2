import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AppHeader } from './AppHeader'
import { ScreenBody } from './ScreenBody'

import type { RootStackParamList } from '../../navigation/types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { ErpTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type Props<T> = {
  title: string
  subtitle?: string
  loadItems: () => Promise<T[]>
  keyExtractor: (item: T) => string
  renderTitle: (item: T) => string
  renderSubtitle?: (item: T) => string | undefined
  searchFilter?: (item: T, query: string) => boolean
  emptyLabel?: string
  navigation?: NativeStackScreenProps<RootStackParamList, keyof RootStackParamList>['navigation']
  showNotifications?: boolean
  onItemPress?: (item: T) => void
  renderItemExtra?: (item: T) => React.ReactNode
  topBanner?: React.ReactNode
}

export function ModuleListScreen<T>({
  title,
  subtitle,
  loadItems,
  keyExtractor,
  renderTitle,
  renderSubtitle,
  searchFilter,
  emptyLabel = 'No items found.',
  navigation,
  showNotifications = true,
  onItemPress,
  renderItemExtra,
  topBanner
}: Props<T>) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      try {
        const list = await loadItems()
        setItems(Array.isArray(list) ? list : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load data')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [loadItems]
  )

  useEffect(() => {
    void load()
  }, [load])

  const filtered = searchFilter
    ? items.filter((item) => searchFilter(item, query.trim().toLowerCase()))
    : items

  return (
    <View style={styles.root}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        navigation={navigation ?? undefined}
        showNotifications={showNotifications}
      />
      <ScreenBody padded={false}>
        {topBanner}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder={`Search ${title.toLowerCase()}…`}
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={erp.textSubtle}
          />
        </View>
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={erp.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
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
            ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={onItemPress ? () => onItemPress(item) : undefined}
                disabled={!onItemPress}
              >
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{renderTitle(item)}</Text>
                    {renderSubtitle ? (
                      <Text style={styles.cardSub}>{renderSubtitle(item) || '—'}</Text>
                    ) : null}
                  </View>
                  {renderItemExtra ? renderItemExtra(item) : null}
                </View>
              </Pressable>
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
  searchWrap: { paddingHorizontal: erp.space.lg, paddingBottom: 8, paddingTop: 8 },
  search: {
    borderWidth: 1,
    borderColor: erp.border,
    borderRadius: erp.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: erp.surface,
    fontSize: 16,
    color: erp.text
  },
  list: { paddingHorizontal: erp.space.lg, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: erp.surface,
    borderRadius: erp.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: erp.border,
    marginBottom: 10,
    ...erp.shadowSm
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: erp.text },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardSub: { fontSize: 13, color: erp.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  error: { color: erp.danger, fontWeight: '600', textAlign: 'center' },
  retry: { color: erp.primary, fontWeight: '700' },
  empty: { textAlign: 'center', color: erp.textMuted, padding: 32, fontSize: 15 }
  })
}