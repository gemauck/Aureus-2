import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'
import { parseInventoryQrPayload } from '../../../../src/utils/inventoryQrPayload.js'
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { useLocationInventory } from '../hooks/useLocationInventory'
import { useJobCardWizard } from '../WizardContext'
import { jc } from '../theme'

export function StockTakeScreen() {
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
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
  const [permission, requestPermission] = useCameraPermissions()
  const editingSkusRef = useRef<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  const applySessionLines = useCallback((lines: Array<{ sku?: string; countedQty?: number }>) => {
    setCounts((prev) => {
      const next = { ...prev }
      for (const line of lines || []) {
        const sku = String(line.sku || '').trim()
        if (!sku || editingSkusRef.current.has(sku)) continue
        next[sku] = String(Number(line.countedQty ?? 0))
      }
      return next
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
      void loadSession(sessionId, { silent: true })
    }, 3000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [sessionId, isOnline, loadSession])

  const filtered = rows.filter((r) => {
    const q = lineSearch.trim().toLowerCase()
    if (!q) return true
    return `${r.name || ''} ${r.sku}`.toLowerCase().includes(q)
  })

  useEffect(() => {
    if (!locationId || !rows.length) return
    const next: Record<string, string> = {}
    for (const r of rows) {
      if (!r.sku) continue
      next[r.sku] = counts[r.sku] ?? String(r.quantity ?? 0)
    }
    setCounts((c) => ({ ...next, ...c }))
  }, [locationId, rows])

  const locationOptions = stockLocations.map((l) => ({
    value: l.id,
    label: l.name || l.id
  }))

  const saveDraft = useCallback(async () => {
    if (!accessToken || !locationId) return
    setSaving(true)
    try {
      const lines = Object.entries(counts).map(([sku, countedQty]) => ({
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
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }, [accessToken, locationId, counts, sessionId])

  const submitForReview = useCallback(async () => {
    if (!accessToken || !sessionId) {
      Alert.alert('Save first', 'Save a draft before submitting for review.')
      return
    }
    setSaving(true)
    try {
      await saveDraft()
      await jobcardsApi.stockTakeSubmit(accessToken, sessionId)
      Alert.alert('Submitted', 'Stock-take submitted for review.')
      setWizardFlow('landing')
    } catch (e) {
      Alert.alert('Submit failed', e instanceof Error ? e.message : 'Could not submit')
    } finally {
      setSaving(false)
    }
  }, [accessToken, sessionId, saveDraft, setWizardFlow])

  function onScanResult(data: string) {
    setScanOpen(false)
    const s = String(data || '').trim()
    if (!s) return

    const parsed = parseInventoryQrPayload(s)
    let sku = ''
    if (parsed?.kind === 'inventory' && parsed.inventoryItemId) {
      const item = rows.find(
        (i) =>
          i.inventoryItemId &&
          String(i.inventoryItemId) === String(parsed.inventoryItemId)
      )
      if (!item?.sku) {
        Alert.alert(
          'Not in list',
          'This item is not in the stock list for the selected location.'
        )
        return
      }
      sku = String(item.sku).trim()
    } else {
      const item = rows.find((r) => String(r.sku || '').trim() === s)
      if (!item?.sku) {
        Alert.alert(
          'Unrecognized scan',
          'Use the inventory QR label on the sticker, or enter the SKU manually.'
        )
        return
      }
      sku = String(item.sku).trim()
    }

    setLineSearch(sku)
    setHighlightSku(sku)
    setCounts((c) => ({ ...c, [sku]: c[sku] ?? '1' }))
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Stock-Take</Text>
      </View>

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
        <Pressable
          style={styles.scanBtn}
          onPress={async () => {
            if (!permission?.granted) {
              const r = await requestPermission()
              if (!r.granted) {
                Alert.alert('Camera required', 'Allow camera to scan barcodes.')
                return
              }
            }
            setScanOpen(true)
          }}
        >
          <Text style={styles.scanBtnText}>Scan barcode / QR</Text>
        </Pressable>
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
          data={filtered}
          keyExtractor={(item: { sku: string }) => item.sku}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: { item: { sku: string; name?: string; quantity?: number } }) => (
            <View
              style={[
                styles.line,
                highlightSku && item.sku === highlightSku && styles.lineHighlighted
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{item.name || item.sku}</Text>
                <Text style={styles.lineSku}>{item.sku}</Text>
                <Text style={styles.onHand}>On hand: {item.quantity ?? 0}</Text>
              </View>
              <TextInput
                style={styles.qtyInput}
                keyboardType="decimal-pad"
                value={counts[item.sku] ?? ''}
                onChangeText={(v) => {
                  editingSkusRef.current.add(item.sku)
                  setCounts((c) => ({ ...c, [item.sku]: v }))
                }}
                onBlur={() => {
                  editingSkusRef.current.delete(item.sku)
                }}
                placeholder="Count"
              />
            </View>
          )}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={[styles.footerBtn, (!isOnline || saving) && styles.disabled]}
          disabled={!isOnline || saving || !locationId}
          onPress={() => void saveDraft()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.footerBtnText}>Save draft</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.footerBtn, styles.submitBtn, (!isOnline || saving) && styles.disabled]}
          disabled={!isOnline || saving}
          onPress={() => void submitForReview()}
        >
          <Text style={styles.footerBtnText}>Submit for review</Text>
        </Pressable>
      </View>

      <BarcodeScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={onScanResult}
      />
    </SafeAreaView>
  )
}

function BarcodeScanModal({
  visible,
  onClose,
  onScan
}: {
  visible: boolean
  onClose: () => void
  onScan: (data: string) => void
}) {
  const lastScan = useRef({ text: '', t: 0 })

  return (
    <Modal visible={visible} animationType="slide">
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
          onBarcodeScanned={({ data }) => {
            const now = Date.now()
            if (data === lastScan.current.text && now - lastScan.current.t < 2000) return
            lastScan.current = { text: data, t: now }
            onScan(data)
          }}
        />
        <Pressable style={styles.closeScan} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Close scanner</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: jc.primaryDark,
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  scanBtnText: { color: '#fff', fontWeight: '700' },
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
    backgroundColor: '#eef6ff'
  },
  lineName: { fontWeight: '600', color: jc.text },
  lineSku: { fontSize: 12, color: jc.textMuted },
  onHand: { fontSize: 12, color: jc.primaryDark, marginTop: 2, fontWeight: '600' },
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
  disabled: { opacity: 0.5 },
  closeScan: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 14,
    borderRadius: 10
  }
})
