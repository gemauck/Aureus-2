import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useAuth } from '../../state/AuthContext'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { useLocationInventory } from '../hooks/useLocationInventory'
import { useJobCardWizard } from '../WizardContext'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useJobCardSync } from '../JobCardSyncContext'
import { queuePendingSubmit } from './stockTransferRequestOfflineStore'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type LineRow = { sku: string; itemName: string; quantity: string }

export function StockTransferRequestScreen() {
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const { accessToken } = useAuth()
  const { isOnline } = useNetwork()
  const { bumpLocalDrafts } = useJobCardSync()
  const { stockLocations, setWizardFlow, ensureInventoryLoaded } = useJobCardWizard()
  const [fromLocationId, setFromLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineRow[]>([])
  const [pickSku, setPickSku] = useState('')
  const [pickQty, setPickQty] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const { rows, loading: stockLoading } = useLocationInventory(fromLocationId, Boolean(fromLocationId), {
    mode: 'jobCard'
  })

  useEffect(() => {
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  const locationOptions = useMemo(
    () =>
      stockLocations.map((loc) => ({
        value: loc.id,
        label: `${loc.code || loc.name} — ${loc.name}`
      })),
    [stockLocations]
  )

  const skuOptions = useMemo(
    () =>
      rows.map((r) => ({
        value: r.sku,
        label: `${r.sku} — ${r.name || r.itemName || r.sku} (${r.quantity ?? 0} on hand)`
      })),
    [rows]
  )

  const addLine = () => {
    const sku = pickSku.trim()
    const qty = parseFloat(pickQty)
    if (!sku || !Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid line', 'Select a SKU and enter a positive quantity.')
      return
    }
    const row = rows.find((r) => r.sku === sku)
    const onHand = Number(row?.quantity) || 0
    if (qty > onHand) {
      Alert.alert('Insufficient stock', `Only ${onHand} available at source for ${sku}.`)
      return
    }
    const itemName = String(row?.name || row?.itemName || sku)
    setLines((prev) => {
      const existing = prev.find((l) => l.sku === sku)
      if (existing) {
        return prev.map((l) => (l.sku === sku ? { ...l, quantity: String(qty) } : l))
      }
      return [...prev, { sku, itemName, quantity: String(qty) }]
    })
    setPickSku('')
    setPickQty('1')
  }

  const submit = useCallback(async () => {
    if (!fromLocationId || !toLocationId) {
      Alert.alert('Locations required', 'Select from and to locations.')
      return
    }
    if (fromLocationId === toLocationId) {
      Alert.alert('Invalid transfer', 'From and to must be different.')
      return
    }
    if (!lines.length) {
      Alert.alert('Add items', 'Add at least one line to transfer.')
      return
    }
    const payload = {
      fromLocationId,
      toLocationId,
      notes: notes.trim(),
      lines: lines.map((l) => ({
        sku: l.sku,
        itemName: l.itemName,
        quantity: parseFloat(l.quantity)
      }))
    }
    setSubmitting(true)
    try {
      if (!isOnline || !accessToken) {
        await queuePendingSubmit(payload)
        bumpLocalDrafts()
        Alert.alert('Saved offline', 'Transfer request queued. It will submit when you are back online.')
        setWizardFlow('landing')
        return
      }
      await jobcardsApi.createStockTransferRequest(accessToken, payload)
      Alert.alert('Submitted', 'Transfer request sent for approval.')
      setWizardFlow('landing')
    } catch (e) {
      Alert.alert('Submit failed', e instanceof Error ? e.message : 'Could not submit request')
    } finally {
      setSubmitting(false)
    }
  }, [
    accessToken,
    bumpLocalDrafts,
    fromLocationId,
    isOnline,
    lines,
    notes,
    setWizardFlow,
    toLocationId
  ])

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <OfflineBanner visible={!isOnline} />
      <View style={styles.header}>
        <Pressable onPress={() => setWizardFlow('landing')} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Transfer stock</Text>
        <Text style={styles.subtitle}>Request stock from another location. Source owner must approve.</Text>
      </View>
      <FlatList
        data={lines}
        keyExtractor={(item) => item.sku}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.label}>From location (source)</Text>
            <SearchableSelect
              value={fromLocationId}
              onChange={setFromLocationId}
              options={locationOptions}
              placeholder="Select source…"
            />
            <Text style={styles.label}>To location (destination)</Text>
            <SearchableSelect
              value={toLocationId}
              onChange={setToLocationId}
              options={locationOptions.filter((o) => o.value !== fromLocationId)}
              placeholder="Select destination…"
            />
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Handover or urgency…"
              multiline
            />
            <Text style={styles.sectionTitle}>Add items</Text>
            {stockLoading && fromLocationId ? (
              <ActivityIndicator color={jc.primary} style={{ marginVertical: 8 }} />
            ) : null}
            <SearchableSelect
              value={pickSku}
              onChange={setPickSku}
              options={skuOptions}
              placeholder={fromLocationId ? 'Search SKU at source…' : 'Select source first'}
            />
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, styles.qtyInput]}
                value={pickQty}
                onChangeText={setPickQty}
                keyboardType="decimal-pad"
                placeholder="Qty"
              />
              <Pressable style={styles.addBtn} onPress={addLine}>
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineSku}>{item.sku}</Text>
              <Text style={styles.lineName}>{item.itemName}</Text>
            </View>
            <Text style={styles.lineQty}>× {item.quantity}</Text>
            <Pressable onPress={() => setLines((prev) => prev.filter((l) => l.sku !== item.sku))}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          lines.length === 0 ? <Text style={styles.empty}>No lines yet.</Text> : null
        }
        ListFooterComponent={
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            disabled={submitting}
            onPress={() => void submit()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit for approval</Text>
            )}
          </Pressable>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  )
}

function createStyles(jc: JcTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: jc.bgGradientMid },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    back: { color: jc.primary, fontSize: 16, marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '700', color: jc.text },
    subtitle: { fontSize: 14, color: jc.textMuted, marginTop: 4 },
    form: { gap: 8, paddingHorizontal: 16 },
    label: { fontSize: 13, fontWeight: '600', color: jc.text, marginTop: 8 },
    input: {
      borderWidth: 1,
      borderColor: jc.border,
      borderRadius: 10,
      padding: 10,
      color: jc.text,
      backgroundColor: jc.surface,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: jc.text, marginTop: 16 },
    addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    qtyInput: { width: 80 },
    addBtn: {
      backgroundColor: jc.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10
    },
    addBtnText: { color: '#fff', fontWeight: '600' },
    listContent: { paddingBottom: 32 },
    lineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: jc.border
    },
    lineSku: { fontFamily: 'monospace', fontSize: 12, color: jc.textMuted },
    lineName: { fontSize: 14, color: jc.text },
    lineQty: { fontSize: 14, fontWeight: '600', color: jc.text },
    remove: { color: jc.danger, fontSize: 13 },
    empty: { textAlign: 'center', color: jc.textMuted, padding: 16 },
    submitBtn: {
      margin: 16,
      backgroundColor: jc.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center'
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: '#fff', fontWeight: '700', fontSize: 16 }
  })
}
