import React, { useEffect, useMemo, useState } from 'react'
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
import type { PriorListRow } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export function PriorListScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const {
    priorRows,
    priorLoading,
    priorSearch,
    setPriorSearch,
    priorClientId,
    setPriorClientId,
    clients,
    users,
    refreshPriorList,
    openJobCard,
    syncOneCard,
    setWizardFlow,
    openingCardId
  } = useJobCardWizard()

  const [priorSiteName, setPriorSiteName] = useState('')
  const [priorTechnician, setPriorTechnician] = useState('')

  useEffect(() => {
    const t = setTimeout(() => void refreshPriorList(), 300)
    return () => clearTimeout(t)
  }, [priorSearch, priorClientId, refreshPriorList])

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name || c.id }))

  const filterSource = useMemo(() => {
    if (!priorClientId) return priorRows
    return priorRows.filter((row) => String(row.clientId || '') === String(priorClientId))
  }, [priorRows, priorClientId])

  const priorSiteOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    filterSource.forEach((jcRow) => {
      const site = String(jcRow.siteName || '').trim()
      if (!site) return
      const key = site.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ value: site, label: site })
    })
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [filterSource])

  const priorTechnicianOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    filterSource.forEach((jcRow) => {
      if (priorSiteName && String(jcRow.siteName || '').trim() !== priorSiteName) return
      const primary = String(jcRow.agentName || '').trim()
      if (primary) {
        const key = primary.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ value: primary, label: primary })
        }
      }
      const team = Array.isArray(jcRow.otherTechnicians) ? jcRow.otherTechnicians : []
      team.forEach((name) => {
        const tech = String(name || '').trim()
        if (!tech) return
        const key = tech.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        out.push({ value: tech, label: tech })
      })
    })
    if (!out.length && users.length) {
      return users.map((u) => ({
        value: u.name || u.email || u.id,
        label: u.name || u.email || u.id
      }))
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [filterSource, priorSiteName, users])

  useEffect(() => {
    setPriorSiteName('')
    setPriorTechnician('')
  }, [priorClientId])

  const q = priorSearch.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      priorRows.filter((row) => {
        if (priorClientId && String(row.clientId || '') !== String(priorClientId)) return false
        if (priorSiteName && String(row.siteName || '').trim() !== priorSiteName) return false
        if (priorTechnician) {
          const primary = String(row.agentName || '').trim()
          const team = Array.isArray(row.otherTechnicians) ? row.otherTechnicians : []
          const match =
            primary === priorTechnician || team.some((t) => String(t).trim() === priorTechnician)
          if (!match) return false
        }
        if (!q) return true
        return priorListLocalSearchHay(row).includes(q)
      }),
    [priorRows, priorClientId, priorSiteName, priorTechnician, q]
  )

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Existing job cards</Text>
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
        <SearchableSelect
          label="Site"
          value={priorSiteName}
          options={[{ value: '', label: 'All sites' }, ...priorSiteOptions]}
          onChange={setPriorSiteName}
          placeholder={priorClientId ? 'All sites' : 'Select client first'}
          disabled={!priorClientId}
        />
        <SearchableSelect
          label="Technician"
          value={priorTechnician}
          options={[{ value: '', label: 'All technicians' }, ...priorTechnicianOptions]}
          onChange={setPriorTechnician}
          placeholder="All technicians"
        />
      </View>

      {priorLoading && !filtered.length ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={jc.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No job cards found</Text>
              <Text style={styles.emptySub}>
                Try adjusting filters or create a new job card from the home screen.
              </Text>
            </View>
          }
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
  const status = row.synced ? (row.status === 'submitted' ? 'Submitted' : 'Synced') : 'Draft'

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onOpen}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <View
            style={[
              styles.statusBadge,
              row.synced ? styles.statusSynced : styles.statusDraft
            ]}
          >
            <Text
              style={[
                styles.statusText,
                row.synced ? styles.statusTextSynced : styles.statusTextDraft
              ]}
            >
              {status}
            </Text>
          </View>
        </View>
        {row.projectName ? (
          <Text style={styles.project} numberOfLines={1}>
            {row.projectName}
          </Text>
        ) : null}
        <Text style={styles.rowSub} numberOfLines={2}>
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

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  header: { paddingHorizontal: jc.space.lg, paddingTop: jc.space.md, gap: 4 },
  back: { color: jc.primary, fontWeight: '600', fontSize: 15 },
  title: { fontSize: 26, fontWeight: '800', color: jc.text, letterSpacing: -0.4 },
  count: { color: jc.textMuted, fontSize: 13, marginBottom: jc.space.sm },
  filters: { paddingHorizontal: jc.space.lg, gap: jc.space.sm, marginBottom: jc.space.sm },
  search: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    backgroundColor: jc.surface,
    fontSize: 16,
    color: jc.text,
    ...jc.shadowSm
  },
  list: { paddingHorizontal: jc.space.lg, paddingBottom: 24 },
  emptyWrap: { alignItems: 'center', marginTop: 48, paddingHorizontal: jc.space.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: jc.text },
  emptySub: { color: jc.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xl,
    padding: jc.space.md,
    marginBottom: jc.space.sm,
    borderWidth: 1,
    borderColor: jc.border,
    gap: jc.space.sm,
    ...jc.shadowSm
  },
  rowPressed: { opacity: 0.95 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontWeight: '700', fontSize: 16, color: jc.text },
  project: { color: jc.primaryDark, fontWeight: '600', fontSize: 13, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDraft: { backgroundColor: jc.warningSoft },
  statusSynced: { backgroundColor: jc.primarySoft },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusTextDraft: { color: jc.warning },
  statusTextSynced: { color: jc.primaryDark },
  rowSub: { color: jc.textMuted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  syncChip: {
    backgroundColor: jc.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: jc.radius.sm
  },
  syncChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  openChevron: { fontSize: 22, color: jc.textSubtle, paddingHorizontal: 4 }
  })
}