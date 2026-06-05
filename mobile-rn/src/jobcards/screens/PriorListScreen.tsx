import React, { useEffect, useMemo } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { priorListLocalSearchHay } from '../../../../src/jobCardWizard/priorList.js'
import { useJobCardWizard } from '../WizardContext'
import { SearchableSelect } from '../components/SearchableSelect'
import { jc } from '../theme'
import type { PriorListRow } from '../types'

export function PriorListScreen() {
  const {
    priorRows,
    priorLoading,
    priorSearch,
    setPriorSearch,
    priorClientId,
    setPriorClientId,
    clients,
    refreshPriorList,
    openJobCard,
    syncOneCard,
    setWizardFlow,
    openingCardId
  } = useJobCardWizard()

  useEffect(() => {
    const t = setTimeout(() => void refreshPriorList(), 300)
    return () => clearTimeout(t)
  }, [priorSearch, priorClientId, refreshPriorList])

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name || c.id }))
  const q = priorSearch.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      priorRows.filter((row) => {
        if (priorClientId && row.clientId !== priorClientId) return false
        if (!q) return true
        return priorListLocalSearchHay(row).includes(q)
      }),
    [priorRows, priorClientId, q]
  )

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Job cards</Text>
        <Text style={styles.count}>{filtered.length} shown</Text>
      </View>
      <View style={styles.filters}>
        <TextInput
          style={styles.search}
          placeholder="Search by client, site, project, tech…"
          placeholderTextColor={jc.textSubtle}
          value={priorSearch}
          onChangeText={setPriorSearch}
          clearButtonMode="while-editing"
        />
        <SearchableSelect
          label="Client"
          value={priorClientId}
          options={[{ value: '', label: 'All clients' }, ...clientOptions]}
          onChange={setPriorClientId}
          placeholder="All clients"
        />
      </View>
      {priorLoading && !filtered.length ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={jc.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No job cards found.</Text>}
          renderItem={({ item }) => (
            <PriorRow
              row={item}
              opening={openingCardId === String(item.id)}
              onOpen={() => void openJobCard(item)}
              onSync={() => void syncOneCard(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

function PriorRow({
  row,
  opening,
  onOpen,
  onSync
}: {
  row: PriorListRow
  opening: boolean
  onOpen: () => void
  onSync: () => void
}) {
  const title = row.heading || row.jobCardNumber || row.clientName || 'Draft'
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onOpen}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {!row.synced ? (
            <View style={styles.unsyncedBadge}>
              <Text style={styles.unsyncedText}>Draft</Text>
            </View>
          ) : null}
        </View>
        {row.projectName ? (
          <Text style={styles.project} numberOfLines={1}>
            {row.projectName}
          </Text>
        ) : null}
        <Text style={styles.rowSub} numberOfLines={1}>
          {row.agentName || '—'} · {row.clientName || '—'} · {row.siteName || row.location || '—'}
        </Text>
      </View>
      {opening ? (
        <ActivityIndicator color={jc.primary} />
      ) : !row.synced ? (
        <Pressable style={styles.syncChip} onPress={onSync} hitSlop={6}>
          <Text style={styles.syncChipText}>Sync</Text>
        </Pressable>
      ) : (
        <Text style={styles.openChevron}>›</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  header: { paddingHorizontal: jc.space.lg, paddingTop: jc.space.md, gap: 4 },
  back: { color: jc.primary, fontWeight: '600', fontSize: 15 },
  title: { fontSize: 26, fontWeight: '800', color: jc.text, letterSpacing: -0.3 },
  count: { color: jc.textMuted, fontSize: 13, marginBottom: jc.space.sm },
  filters: { paddingHorizontal: jc.space.lg, gap: jc.space.sm, marginBottom: jc.space.sm },
  search: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    backgroundColor: jc.surface,
    fontSize: 16,
    color: jc.text
  },
  list: { paddingHorizontal: jc.space.lg, paddingBottom: 24 },
  empty: { textAlign: 'center', color: jc.textMuted, marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.lg,
    padding: jc.space.md,
    marginBottom: jc.space.sm,
    borderWidth: 1,
    borderColor: jc.border,
    gap: jc.space.sm,
    ...jc.shadow
  },
  rowPressed: { opacity: 0.95 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontWeight: '700', fontSize: 16, color: jc.text },
  project: { color: jc.primaryDark, fontWeight: '600', fontSize: 13, marginTop: 2 },
  unsyncedBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  unsyncedText: { color: jc.warning, fontSize: 11, fontWeight: '700' },
  rowSub: { color: jc.textMuted, marginTop: 4, fontSize: 13 },
  syncChip: {
    backgroundColor: jc.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: jc.radius.sm
  },
  syncChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  openChevron: { fontSize: 22, color: jc.textSubtle, paddingHorizontal: 4 }
})
