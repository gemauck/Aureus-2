import React, { useEffect, useMemo } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { createStockEntryRow } from '../../../../src/jobCardWizard/formDefaults.js'
import { useJobCardWizard } from '../WizardContext'
import { useLocationInventory } from '../hooks/useLocationInventory'
import { SearchableSelect } from '../components/SearchableSelect'
import { SectionCard } from '../components/SectionCard'
import { jc } from '../theme'
import type { JobCardFormData, StockEntryRow as StockRow, StockLocation } from '../types'

function StockEntryRowEditor({
  row,
  idx,
  total,
  stockLocations,
  locationOptions,
  onUpdate,
  onRemove,
  onApply
}: {
  row: StockRow
  idx: number
  total: number
  stockLocations: StockLocation[]
  locationOptions: { value: string; label: string }[]
  onUpdate: (id: string, patch: Partial<StockRow>) => void
  onRemove: (id: string) => void
  onApply: () => void
}) {
  const { rows, loading, error } = useLocationInventory(row.locationId, Boolean(row.locationId))

  const skuOptions = useMemo(
    () =>
      rows.map((i) => ({
        value: i.sku,
        label: `${i.name || i.sku} · on hand ${i.quantity ?? 0}`
      })),
    [rows]
  )

  const selectedPick = rows.find((i) => i.sku === row.sku)

  return (
    <View style={styles.stockRow}>
      {total > 1 ? (
        <View style={styles.locHeader}>
          <Text style={styles.locLabel}>Line {idx + 1}</Text>
          <Pressable onPress={() => onRemove(row.id)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      <SearchableSelect
        label="Stock location"
        value={row.locationId}
        options={locationOptions}
        onChange={(locationId) => onUpdate(row.id, { locationId, sku: '' })}
        placeholder="Select location…"
      />
      {row.locationId && loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={jc.primary} size="small" />
          <Text style={styles.loadingText}>Loading stock for location…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <SearchableSelect
        label="Component / SKU"
        value={row.sku}
        options={skuOptions}
        onChange={(sku) => {
          onUpdate(row.id, { sku })
          onApply()
        }}
        placeholder={
          !row.locationId
            ? 'Choose location first'
            : skuOptions.length
              ? 'Search SKU…'
              : 'No stock at this location'
        }
        disabled={!row.locationId || loading}
        hint={
          selectedPick
            ? `On hand: ${selectedPick.quantity ?? 0}`
            : row.locationId && !loading
              ? `${skuOptions.length} SKU(s) available`
              : undefined
        }
      />
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="Quantity used"
        value={row.quantity ? String(row.quantity) : ''}
        onChangeText={(t) => onUpdate(row.id, { quantity: parseFloat(t) || 0 })}
        onBlur={onApply}
      />
    </View>
  )
}

export function StockStep() {
  const {
    formData,
    setFormData,
    stockLocations,
    stockEntryRows,
    setStockEntryRows,
    ensureInventoryLoaded
  } = useJobCardWizard()

  useEffect(() => {
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  const locationOptions = stockLocations.map((l) => ({
    value: l.id,
    label: l.name || l.code || l.id
  }))

  function applyStockFromRows() {
    const lines = stockEntryRows
      .filter((r) => r.locationId && r.sku && r.quantity > 0)
      .map((r) => {
        const loc = stockLocations.find((l) => l.id === r.locationId)
        return {
          id: r.id,
          sku: r.sku,
          quantity: r.quantity,
          locationId: r.locationId,
          locationName: loc?.name || '',
          itemName: r.sku
        }
      })
    setFormData((f) => ({ ...f, stockUsed: lines }))
  }

  function updateRow(id: string, patch: Partial<(typeof stockEntryRows)[0]>) {
    setStockEntryRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  return (
    <View>
      {!stockLocations.length ? (
        <Text style={styles.warn}>
          Stock locations not loaded — check your connection and reopen this step.
        </Text>
      ) : null}
      <SectionCard
        title="Stock used"
        subtitle="Pick a warehouse, then choose a SKU. Lists load per location."
        accent
      >
        {stockEntryRows.map((row, idx) => (
          <StockEntryRowEditor
            key={row.id}
            row={row}
            idx={idx}
            total={stockEntryRows.length}
            stockLocations={stockLocations}
            locationOptions={locationOptions}
            onUpdate={updateRow}
            onRemove={(id) => setStockEntryRows((rows) => rows.filter((r) => r.id !== id))}
            onApply={applyStockFromRows}
          />
        ))}
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => setStockEntryRows((r) => [...r, createStockEntryRow()])}
        >
          <Text style={styles.secondaryBtnText}>+ Add stock line</Text>
        </Pressable>
        {formData.stockUsed.length > 0 ? (
          <View style={styles.appliedBox}>
            <Text style={styles.summary}>{formData.stockUsed.length} line(s) on job card</Text>
            {formData.stockUsed.map((line) => (
              <Text key={`${line.sku}-${line.locationId}`} style={styles.lineItem}>
                {line.itemName || line.sku} × {line.quantity} @ {line.locationName || 'site'}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>Pick location, SKU, and qty — saves automatically.</Text>
        )}
      </SectionCard>

      <SectionCard title="Materials bought (ad-hoc)">
        <MaterialSection formData={formData} setFormData={setFormData} />
      </SectionCard>
    </View>
  )
}

function MaterialSection({
  formData,
  setFormData
}: {
  formData: JobCardFormData
  setFormData: React.Dispatch<React.SetStateAction<JobCardFormData>>
}) {
  const [matDraft, setMatDraft] = React.useState({
    itemName: '',
    description: '',
    reason: '',
    cost: ''
  })

  return (
    <>
      <TextInput
        style={styles.input}
        placeholder="Item name"
        value={matDraft.itemName}
        onChangeText={(itemName) => setMatDraft((d) => ({ ...d, itemName }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Description"
        value={matDraft.description}
        onChangeText={(description) => setMatDraft((d) => ({ ...d, description }))}
      />
      <TextInput
        style={styles.input}
        placeholder="Reason"
        value={matDraft.reason}
        onChangeText={(reason) => setMatDraft((d) => ({ ...d, reason }))}
      />
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="Cost"
        value={matDraft.cost}
        onChangeText={(cost) => setMatDraft((d) => ({ ...d, cost }))}
      />
      <Pressable
        style={styles.primaryBtn}
        onPress={() => {
          if (!matDraft.itemName.trim()) return
          setFormData((f) => ({
            ...f,
            materialsBought: [
              ...f.materialsBought,
              {
                id: `mat_${Date.now()}`,
                itemName: matDraft.itemName,
                description: matDraft.description,
                reason: matDraft.reason,
                cost: parseFloat(matDraft.cost) || 0
              }
            ]
          }))
          setMatDraft({ itemName: '', description: '', reason: '', cost: '' })
        }}
      >
        <Text style={styles.primaryBtnText}>Add material</Text>
      </Pressable>
      {formData.materialsBought.map((m) => (
        <View key={m.id} style={styles.matRow}>
          <Text style={styles.matTitle}>{m.itemName}</Text>
          <Text style={styles.matSub}>
            R{m.cost} — {m.reason}
          </Text>
          <Pressable
            onPress={() =>
              setFormData((f) => ({
                ...f,
                materialsBought: f.materialsBought.filter((x) => x.id !== m.id)
              }))
            }
          >
            <Text style={styles.matRemove}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  stockRow: { gap: 10, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: jc.border },
  locLabel: { fontSize: 12, fontWeight: '600', color: jc.textMuted },
  locHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: { color: jc.danger, fontSize: 13, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: jc.textMuted, fontSize: 13 },
  errorText: { color: '#b45309', fontSize: 13 },
  warn: { color: '#b45309', marginBottom: 12, padding: 10, backgroundColor: '#fffbeb', borderRadius: jc.radius.md },
  input: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    fontSize: 16,
    backgroundColor: jc.surface,
    color: jc.text
  },
  primaryBtn: { backgroundColor: jc.primary, padding: 14, borderRadius: jc.radius.md, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: jc.primary,
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  secondaryBtnText: { color: jc.primaryDark, fontWeight: '700' },
  appliedBox: {
    backgroundColor: jc.primarySoft,
    padding: jc.space.md,
    borderRadius: jc.radius.md,
    gap: 4
  },
  summary: { color: jc.primaryDark, fontWeight: '700' },
  lineItem: { color: jc.text, fontSize: 13 },
  hint: { color: jc.textMuted, fontSize: 13, fontStyle: 'italic' },
  matRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: jc.border },
  matTitle: { fontWeight: '600', color: jc.text },
  matSub: { color: jc.textMuted, fontSize: 13 },
  matRemove: { color: jc.danger, marginTop: 4, fontWeight: '600' }
})
