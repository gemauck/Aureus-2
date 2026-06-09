import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { InventoryBarcodeScannerModal } from '../../components/InventoryBarcodeScannerModal'
import { parseInventoryQrPayload } from '../../../../src/utils/inventoryQrPayload.js'
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { useLocationInventory } from '../hooks/useLocationInventory'
import { useJobCardWizard } from '../WizardContext'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useJobCardSync } from '../JobCardSyncContext'
import {
  clearLocalDraft,
  queuePendingSubmit,
  readLocalDraft,
  saveLocalDraft
} from './stockTakeOfflineStore'
import { syncOnePendingStockTakeSubmit } from './stockTakeSync'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

export function StockTakeScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const { bumpLocalDrafts } = useJobCardSync()
  const { stockLocations, setWizardFlow, ensureInventoryLoaded } = useJobCardWizard()
  const [locationId, setLocationId] = useState('')
  const { rows, loading: stockLoading, error: stockError } = useLocationInventory(
    locationId,
    Boolean(locationId)
  )
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [lineSearch, setLineSearch] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [highlightSku, setHighlightSku] = useState('')
  /** After QR scan: show only this SKU until cleared (same as web stock-take). */
  const [scanFilterSku, setScanFilterSku] = useState('')
  const editingSkusRef = useRef<Set<string>>(new Set())
  const rowsRef = useRef(rows)
  const listRef = useRef<FlatList<{ sku: string }> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = await readLocalDraft()
      if (cancelled || !draft?.locationId) return
      setLocationId(draft.locationId)
      if (draft.sessionId) setSessionId(draft.sessionId)
      if (draft.counts && Object.keys(draft.counts).length) setCounts(draft.counts)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!locationId) return undefined
    const timer = setTimeout(() => {
      void saveLocalDraft({
        locationId,
        counts,
        sessionId: sessionId || undefined,
        savedAt: new Date().toISOString()
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [locationId, counts, sessionId])

  const applySessionLines = useCallback((lines: Array<{ sku?: string; countedQty?: number }>) => {
    setCounts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const line of lines || []) {
        const sku = String(line.sku || '').trim()
        if (!sku || editingSkusRef.current.has(sku)) continue
        const val = String(Number(line.countedQty ?? 0))
        if (next[sku] !== val) {
          next[sku] = val
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const loadSession = useCallback(
    async (id: string, { silent = false } = {}) => {
      if (!accessToken || !id) return null
      try {
        const res = (await jobcardsApi.stockTakeGet(accessToken, id)) as {
          submission?: { status?: string; locationId?: string; lines?: Array<{ sku?: string; countedQty?: number }> }
          data?: { submission?: { status?: string; locationId?: string; lines?: Array<{ sku?: string; countedQty?: number }> } }
        }
        const submission = res?.data?.submission || res?.submission
        if (!submission) return null
        if (submission.status && submission.status !== 'in_progress' && submission.status !== 'draft') {
          if (!silent) {
            setSessionId('')
            Alert.alert('Session ended', 'This stock-take session is no longer active.')
          }
          return submission
        }
        if (submission.locationId) setLocationId(submission.locationId)
        applySessionLines(submission.lines || [])
        return submission
      } catch {
        return null
      }
    },
    [accessToken, applySessionLines]
  )

  useEffect(() => {
    if (!sessionId || !isOnline) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    void loadSession(sessionId, { silent: true })
    pollRef.current = setInterval(() => {
      if (editingSkusRef.current.size > 0) return
      void loadSession(sessionId, { silent: true })
    }, 3000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [sessionId, isOnline, loadSession])

  const filtered = useMemo(() => {
    const scanSku = scanFilterSku.trim()
    if (scanSku) {
      return rows.filter((r) => String(r.sku || '').trim() === scanSku)
    }
    const q = lineSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const sku = String(r.sku || '').trim().toLowerCase()
      const name = String(r.name || '').trim().toLowerCase()
      return sku.includes(q) || name.includes(q)
    })
  }, [rows, lineSearch, scanFilterSku])

  useEffect(() => {
    if (!locationId) {
      setCounts({})
      setScanFilterSku('')
      setHighlightSku('')
      return
    }
    if (!rows.length) return
    setCounts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const r of rows) {
        if (!r.sku) continue
        if (!(r.sku in next)) {
          next[r.sku] = ''
          changed = true
        }
      }
      for (const sku of Object.keys(next)) {
        if (!rows.some((r) => r.sku === sku)) {
          delete next[sku]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [locationId, rows])

  useEffect(() => {
    const sku = scanFilterSku.trim()
    if (!sku || filtered.length !== 1) return
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0.15 })
    })
  }, [scanFilterSku, filtered.length])

  const locationOptions = stockLocations.map((l) => ({
    value: l.id,
    label: l.name || l.id
  }))

  const saveDraft = useCallback(async () => {
    if (!locationId) return
    setSaving(true)
    try {
      await saveLocalDraft({
        locationId,
        counts,
        sessionId: sessionId || undefined,
        savedAt: new Date().toISOString()
      })
      if (!isOnline || !accessToken) {
        Alert.alert('Saved offline', 'Counts saved on this device. They will sync when you reconnect.')
        return
      }
      const lines = Object.entries(counts)
        .filter(([, raw]) => raw !== undefined && raw !== null && String(raw).trim() !== '')
        .map(([sku, countedQty]) => ({
          sku,
          countedQty: parseFloat(countedQty) || 0
        }))
      const body = {
        locationId,
        description: `Stock take ${new Date().toLocaleDateString()}`,
        lines,
        status: 'draft'
      }
      if (sessionId) {
        await jobcardsApi.stockTakePatch(accessToken, sessionId, body)
      } else {
        const res = (await jobcardsApi.stockTakeCreate(accessToken, body)) as {
          id?: string
          submission?: { id?: string }
          data?: { submission?: { id?: string } }
        }
        const newId = res?.id || res?.submission?.id || res?.data?.submission?.id
        if (newId) setSessionId(String(newId))
      }
      Alert.alert('Saved', 'Stock-take draft saved.')
    } catch (e) {
      Alert.alert(
        'Saved offline',
        e instanceof Error
          ? `${e.message} Counts are stored on this device.`
          : 'Could not reach server. Counts are stored on this device.'
      )
    } finally {
      setSaving(false)
    }
  }, [accessToken, locationId, counts, sessionId, isOnline])

  const submitForReview = useCallback(async () => {
    if (!locationId) {
      Alert.alert('Location required', 'Select a stock location first.')
      return
    }
    const hasCounts = Object.values(counts).some((v) => String(v).trim() !== '')
    if (!hasCounts) {
      Alert.alert('Counts required', 'Enter at least one counted quantity before submitting.')
      return
    }
    setSaving(true)
    try {
      await saveLocalDraft({
        locationId,
        counts,
        sessionId: sessionId || undefined,
        savedAt: new Date().toISOString()
      })
      if (!isOnline || !accessToken) {
        await queuePendingSubmit({ locationId, counts, sessionId: sessionId || undefined })
        bumpLocalDrafts()
        Alert.alert(
          'Queued offline',
          'Stock-take will submit for review when you reconnect.'
        )
        await clearLocalDraft()
        setWizardFlow('landing')
        return
      }
      await saveDraft()
      let activeSessionId = sessionId
      if (!activeSessionId) {
        const lines = Object.entries(counts)
          .filter(([, raw]) => raw !== undefined && raw !== null && String(raw).trim() !== '')
          .map(([sku, countedQty]) => ({
            sku,
            countedQty: parseFloat(countedQty) || 0
          }))
        const res = (await jobcardsApi.stockTakeCreate(accessToken, {
          locationId,
          description: `Stock take ${new Date().toLocaleDateString()}`,
          lines,
          status: 'draft'
        })) as {
          id?: string
          submission?: { id?: string }
          data?: { submission?: { id?: string } }
        }
        activeSessionId = String(res?.id || res?.submission?.id || res?.data?.submission?.id || '')
        if (!activeSessionId) {
          Alert.alert('Submit failed', 'Could not create stock-take session.')
          return
        }
        setSessionId(activeSessionId)
      }
      await jobcardsApi.stockTakeSubmit(accessToken, activeSessionId)
      await clearLocalDraft()
      Alert.alert('Submitted', 'Stock-take submitted for review.')
      setWizardFlow('landing')
    } catch (e) {
      const pendingId = await queuePendingSubmit({
        locationId,
        counts,
        sessionId: sessionId || undefined
      })
      bumpLocalDrafts()
      if (isOnline && accessToken) {
        const result = await syncOnePendingStockTakeSubmit(
          accessToken,
          {
            id: pendingId,
            locationId,
            counts,
            sessionId: sessionId || undefined,
            savedAt: new Date().toISOString()
          },
          { submitForReview: true }
        )
        if (result.ok) {
          await clearLocalDraft()
          bumpLocalDrafts()
          Alert.alert('Submitted', 'Stock-take submitted for review.')
          setWizardFlow('landing')
          return
        }
      }
      Alert.alert(
        'Queued offline',
        e instanceof Error
          ? `${e.message} Submission queued for when you reconnect.`
          : 'Submission queued for when you reconnect.'
      )
      await clearLocalDraft()
      setWizardFlow('landing')
    } finally {
      setSaving(false)
    }
  }, [
    accessToken,
    bumpLocalDrafts,
    counts,
    isOnline,
    locationId,
    saveDraft,
    sessionId,
    setWizardFlow
  ])

  const clearScanFilter = useCallback(() => {
    setScanFilterSku('')
    setLineSearch('')
    setHighlightSku('')
  }, [])

  const onScanResult = useCallback(async (data: string) => {
    setScanOpen(false)
    const s = String(data || '').trim()
    if (!s) return

    const currentRows = rowsRef.current
    const parsed = parseInventoryQrPayload(s)
    let sku = ''

    if (parsed?.kind === 'inventory' && parsed.inventoryItemId) {
      let item = currentRows.find(
        (i) =>
          i.inventoryItemId &&
          String(i.inventoryItemId) === String(parsed.inventoryItemId)
      )
      if (!item?.sku) {
        try {
          const catalog = await jobcardsApi.getPublicInventory()
          const hit = catalog.find(
            (i) => String(i.id || '').trim() === String(parsed.inventoryItemId).trim()
          )
          if (hit?.sku) {
            item = currentRows.find(
              (r) => String(r.sku || '').trim() === String(hit.sku).trim()
            )
          }
        } catch {
          /* ignore catalog lookup failure */
        }
      }
      if (!item?.sku) {
        Alert.alert(
          'Not in list',
          'This item is not in the stock list for the selected location.'
        )
        return
      }
      sku = String(item.sku).trim()
    } else {
      const item = currentRows.find((r) => String(r.sku || '').trim() === s)
      if (!item?.sku) {
        Alert.alert(
          'Unrecognized scan',
          'Use the inventory QR label on the sticker, or enter the SKU manually.'
        )
        return
      }
      sku = String(item.sku).trim()
    }

    setScanFilterSku(sku)
    setLineSearch('')
    setHighlightSku(sku)
  }, [])

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Stock-Take</Text>
      </View>
      <OfflineBanner visible={!isOnline} />

      <View style={styles.panel}>
        <SearchableSelect
          label="Warehouse / location"
          value={locationId}
          options={locationOptions}
          onChange={setLocationId}
          placeholder="Select location…"
        />
        <TextInput
          style={styles.search}
          placeholder="Filter SKUs…"
          value={lineSearch}
          onChangeText={setLineSearch}
        />
        <Pressable style={styles.scanBtn} onPress={() => setScanOpen(true)}>
          <Text style={styles.scanBtnText}>Scan barcode / QR</Text>
        </Pressable>
        {scanFilterSku ? (
          <Pressable style={styles.clearScanBtn} onPress={clearScanFilter}>
            <Text style={styles.clearScanText}>
              Showing scan: {scanFilterSku} · tap to show all
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!locationId ? (
        <Text style={styles.hint}>Select a stock location to load the catalog.</Text>
      ) : stockLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={jc.primary} size="large" />
          <Text style={styles.hint}>Loading stock list…</Text>
        </View>
      ) : stockError ? (
        <Text style={styles.error}>{stockError}</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={(item: { sku: string }) => item.sku}
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true
            })
          }}
          renderItem={({ item }: { item: { sku: string; name?: string; quantity?: number } }) => (
            <View
              style={[
                styles.line,
                highlightSku && item.sku === highlightSku ? styles.lineHighlighted : null
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{item.name || item.sku}</Text>
                <Text style={styles.lineSku}>{item.sku}</Text>
              </View>
              <TextInput
                style={styles.qtyInput}
                keyboardType="decimal-pad"
                value={counts[item.sku] ?? ''}
                onFocus={() => {
                  editingSkusRef.current.add(item.sku)
                }}
                onChangeText={(v) => {
                  editingSkusRef.current.add(item.sku)
                  setCounts((c) => ({ ...c, [item.sku]: v }))
                }}
                onBlur={() => {
                  setTimeout(() => {
                    editingSkusRef.current.delete(item.sku)
                  }, 400)
                }}
                placeholder="Count"
              />
            </View>
          )}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={[styles.footerBtn, (saving || !locationId) && styles.disabled]}
          disabled={saving || !locationId}
          onPress={() => void saveDraft()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.footerBtnText}>Save draft</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.footerBtn, styles.submitBtn, (saving || !locationId) && styles.disabled]}
          disabled={saving || !locationId}
          onPress={() => void submitForReview()}
        >
          <Text style={styles.footerBtnText}>Submit for review</Text>
        </Pressable>
      </View>

      <InventoryBarcodeScannerModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={onScanResult}
      />
    </SafeAreaView>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: jc.bg },
  header: { padding: 16, gap: 6 },
  back: { color: jc.primaryDark, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: jc.text },
  panel: { paddingHorizontal: 16, gap: 10 },
  search: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 12,
    backgroundColor: jc.surface,
    color: jc.text
  },
  scanBtn: {
    backgroundColor: jc.primary,
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  scanBtnText: { color: '#fff', fontWeight: '700' },
  clearScanBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: jc.radius.sm,
    backgroundColor: jc.primarySoft,
    borderWidth: 1,
    borderColor: jc.primary
  },
  clearScanText: { color: jc.primaryDark, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  hint: { textAlign: 'center', color: jc.textMuted, marginTop: 40, padding: 16 },
  loadingWrap: { alignItems: 'center', marginTop: 48, gap: 12 },
  error: { textAlign: 'center', color: jc.danger, marginTop: 40, padding: 16, fontWeight: '600' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: jc.border,
    ...jc.shadow
  },
  lineHighlighted: {
    borderColor: jc.primary,
    borderWidth: 2,
    backgroundColor: jc.primarySoft
  },
  lineName: { fontWeight: '600', color: jc.text },
  lineSku: { fontSize: 12, color: jc.textMuted },
  qtyInput: {
    width: 72,
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.sm,
    padding: 8,
    textAlign: 'center',
    backgroundColor: jc.surface,
    color: jc.text
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: jc.border,
    backgroundColor: jc.surface
  },
  footerBtn: {
    flex: 1,
    backgroundColor: jc.primary,
    padding: 14,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  submitBtn: { backgroundColor: jc.success },
  footerBtnText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 }
  })
}