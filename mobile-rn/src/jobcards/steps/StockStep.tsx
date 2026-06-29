import React, { useEffect, useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { createStockEntryRow } from '../../../../src/jobCardWizard/formDefaults.js'
import { findPendingStockEntryRows } from '../../../../src/jobCardWizard/stockEntryFlush.js'
import { findPendingMaterialDraft } from '../../../../src/jobCardWizard/wizardDraftFlush.js'
import { useJobCardWizard } from '../WizardContext'
import { useLocationInventory } from '../hooks/useLocationInventory'
import { SearchableSelect } from '../components/SearchableSelect'
import { SectionCard } from '../components/SectionCard'
import { InfoBanner } from '../components/InfoBanner'
import { useFormStyles } from '../components/formStyles'
import type { InventoryItem, JobCardFormData, StockEntryRow as StockRow, StockLocation } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

function StockEntryRowEditor({
  row,
  idx,
  total,
  locationOptions,
  onUpdate,
  onRemove,
  onAddLine,
  catalogFallback
}: {
  row: StockRow
  idx: number
  total: number
  locationOptions: { value: string; label: string }[]
  onUpdate: (id: string, patch: Partial<StockRow>) => void
  onRemove: (id: string) => void
  onAddLine: (rowId: string, pick?: { itemName?: string }) => void
  catalogFallback: InventoryItem[]
}) {
  const styles = useThemedStyles(createStyles)
  const formStyles = useFormStyles()
  const { jc } = useTheme()
  const { rows, loading, error, fromCache } = useLocationInventory(row.locationId, Boolean(row.locationId), {
    mode: 'jobCard',
    catalogFallback
  })

  const skuOptions = useMemo(
    () =>
      rows.map((i) => ({
        value: i.sku,
        label: `${i.name || i.sku} · on hand ${i.quantity ?? 0}`
      })),
    [rows]
  )

  const selectedPick = rows.find((i) => i.sku === row.sku)
  const canAdd = Boolean(row.locationId && row.sku && row.quantity > 0)

  return (
    <View style={styles.stockRow}>
      {total > 1 ? (
        <View style={styles.locHeader}>
          <Text style={styles.locLabel}>Stock location {idx + 1}</Text>
          <Pressable onPress={() => onRemove(row.id)}>
            <Text style={styles.remove}>Remove location</Text>
          </Pressable>
        </View>
      ) : null}
      <SearchableSelect
        label="Stock location"
        value={row.locationId}
        options={locationOptions}
        onChange={(locationId) => onUpdate(row.id, { locationId, sku: '' })}
        placeholder="Select stock location first…"
      />
      {row.locationId && loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={jc.primary} size="small" />
          <Text style={styles.loadingText}>Loading stock for location…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {fromCache && row.locationId && !loading ? (
        <Text style={styles.cacheHint}>Using cached stock for this location (offline).</Text>
      ) : null}
      {row.locationId && !loading && skuOptions.length === 0 ? (
        <Text style={styles.noStockHint}>No on-hand stock at this location.</Text>
      ) : null}
      <SearchableSelect
        label="Component / SKU"
        value={row.sku}
        options={skuOptions}
        onChange={(sku) => onUpdate(row.id, { sku })}
        placeholder={
          !row.locationId
            ? 'Choose location first'
            : skuOptions.length
              ? 'Search component…'
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
        style={formStyles.input}
        keyboardType="decimal-pad"
        placeholder="Quantity used"
        placeholderTextColor={jc.textSubtle}
        value={row.quantity ? String(row.quantity) : ''}
        onChangeText={(t) => onUpdate(row.id, { quantity: parseFloat(t) || 0 })}
      />
      <Pressable
        style={[formStyles.primaryBtn, !canAdd && styles.btnDisabled]}
        disabled={!canAdd}
        onPress={() => onAddLine(row.id, { itemName: selectedPick?.name })}
      >
        <Text style={formStyles.primaryBtnText}>+ Add to job card</Text>
      </Pressable>
    </View>
  )
}

export function StockStep() {
  const formStyles = useFormStyles()
  const styles = useThemedStyles(createStyles)
  const {
    formData,
    setFormData,
    stockLocations,
    stockEntryRows,
    setStockEntryRows,
    materialDraft,
    setMaterialDraft,
    ensureInventoryLoaded,
    inventory
  } = useJobCardWizard()

  useEffect(() => {
    void ensureInventoryLoaded()
  }, [ensureInventoryLoaded])

  const locationOptions = stockLocations.map((l) => ({
    value: l.id,
    label: l.name || l.code || l.id
  }))

  const totalMaterialCost = useMemo(
    () => (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0),
    [formData.materialsBought]
  )

  const pendingEntryRows = useMemo(
    () => findPendingStockEntryRows(stockEntryRows, formData.stockUsed),
    [stockEntryRows, formData.stockUsed]
  )

  const pendingMaterialDraft = useMemo(
    () => findPendingMaterialDraft(materialDraft),
    [materialDraft]
  )

  function addStockFromRow(rowId: string, pick?: { itemName?: string }) {
    const row = stockEntryRows.find((r) => r.id === rowId)
    if (!row?.locationId || !row.sku || !(row.quantity > 0)) return
    const loc = stockLocations.find((l) => l.id === row.locationId)
    const line = {
      id: row.id,
      sku: row.sku,
      quantity: row.quantity,
      locationId: row.locationId,
      locationName: loc?.name || '',
      itemName: pick?.itemName || row.sku
    }
    setFormData((f) => {
      const existing = f.stockUsed.filter((x) => x.id !== line.id)
      return { ...f, stockUsed: [...existing, line] }
    })
  }

  function removeStockLine(id: string) {
    setFormData((f) => ({
      ...f,
      stockUsed: f.stockUsed.filter((x) => x.id !== id)
    }))
  }

  function updateRow(id: string, patch: Partial<(typeof stockEntryRows)[0]>) {
    setStockEntryRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  return (
    <View>
      {!stockLocations.length ? (
        <InfoBanner tone="warning">
          Stock locations not loaded — check your connection and reopen this step.
        </InfoBanner>
      ) : null}

      <SectionCard
        title="Stock Used"
        subtitle="Record components issued from inventory for this job."
        accent
        badge={formData.stockUsed.length ? `${formData.stockUsed.length} item(s)` : undefined}
      >
        <InfoBanner tone="info">
          Select the stock location first (e.g. each bakkie or warehouse). The component list only
          includes items with quantity on hand at that site. Use “Add another stock location” when
          stock comes from more than one place. Tap “+ Add to job card” or continue — unfinished
          lines are saved automatically when you move on or submit.
        </InfoBanner>

        {pendingEntryRows.length > 0 ? (
          <InfoBanner tone="warning">
            {pendingEntryRows.length} line{pendingEntryRows.length === 1 ? '' : 's'} selected but not
            yet in the list below — tap “+ Add to job card” or go to the next step to include{' '}
            {pendingEntryRows.length === 1 ? 'it' : 'them'}.
          </InfoBanner>
        ) : null}

        {stockEntryRows.map((row, idx) => (
          <StockEntryRowEditor
            key={row.id}
            row={row}
            idx={idx}
            total={stockEntryRows.length}
            locationOptions={locationOptions}
            onUpdate={updateRow}
            onRemove={(id) => setStockEntryRows((rows) => rows.filter((r) => r.id !== id))}
            onAddLine={addStockFromRow}
            catalogFallback={inventory}
          />
        ))}

        <Pressable
          style={formStyles.secondaryBtn}
          onPress={() => setStockEntryRows((r) => [...r, createStockEntryRow()])}
        >
          <Text style={formStyles.secondaryBtnText}>+ Add another stock location</Text>
        </Pressable>

        {formData.stockUsed.length > 0 ? (
          <View style={styles.appliedBox}>
            {formData.stockUsed.map((line) => (
              <View key={line.id || `${line.sku}-${line.locationId}`} style={styles.appliedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appliedTitle}>{line.itemName || line.sku}</Text>
                  <Text style={styles.appliedSub}>
                    {line.locationName || 'Location N/A'} · Qty: {line.quantity} · SKU: {line.sku}
                  </Text>
                </View>
                <Pressable onPress={() => removeStockLine(String(line.id))} hitSlop={8}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>No stock lines added yet.</Text>
        )}
      </SectionCard>

      <SectionCard
        title="Materials Bought (Ad-hoc)"
        subtitle="Purchases made on site that are not from inventory."
        badge={formData.materialsBought.length ? `${formData.materialsBought.length}` : undefined}
      >
        <MaterialSection
          formData={formData}
          setFormData={setFormData}
          totalMaterialCost={totalMaterialCost}
          materialDraft={materialDraft}
          setMaterialDraft={setMaterialDraft}
          pendingMaterialDraft={pendingMaterialDraft}
        />
      </SectionCard>
    </View>
  )
}

function MaterialSection({
  formData,
  setFormData,
  totalMaterialCost,
  materialDraft,
  setMaterialDraft,
  pendingMaterialDraft
}: {
  formData: JobCardFormData
  setFormData: React.Dispatch<React.SetStateAction<JobCardFormData>>
  totalMaterialCost: number
  materialDraft: { itemName: string; description: string; reason: string; cost: string }
  setMaterialDraft: React.Dispatch<
    React.SetStateAction<{ itemName: string; description: string; reason: string; cost: string }>
  >
  pendingMaterialDraft: { itemName: string; description: string; reason: string; cost: string } | null
}) {
  const styles = useThemedStyles(createStyles)
  const formStyles = useFormStyles()
  const { jc } = useTheme()

  return (
    <>
      {pendingMaterialDraft ? (
        <InfoBanner tone="warning">
          Material “{pendingMaterialDraft.itemName}” is filled in but not added yet — tap “+ Add
          material” or continue to save it automatically.
        </InfoBanner>
      ) : null}
      <View style={formStyles.row}>
        <TextInput
          style={[formStyles.input, { flex: 1 }]}
          placeholder="Item name *"
          placeholderTextColor={jc.textSubtle}
          value={materialDraft.itemName}
          onChangeText={(itemName) => setMaterialDraft((d) => ({ ...d, itemName }))}
        />
        <TextInput
          style={[formStyles.input, { flex: 0.45 }]}
          keyboardType="decimal-pad"
          placeholder="Cost (R) *"
          placeholderTextColor={jc.textSubtle}
          value={materialDraft.cost}
          onChangeText={(cost) => setMaterialDraft((d) => ({ ...d, cost }))}
        />
      </View>
      <TextInput
        style={formStyles.input}
        placeholder="Description"
        placeholderTextColor={jc.textSubtle}
        value={materialDraft.description}
        onChangeText={(description) => setMaterialDraft((d) => ({ ...d, description }))}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Reason for purchase"
        placeholderTextColor={jc.textSubtle}
        value={materialDraft.reason}
        onChangeText={(reason) => setMaterialDraft((d) => ({ ...d, reason }))}
      />
      <Pressable
        style={[formStyles.primaryBtn, !materialDraft.itemName.trim() && styles.btnDisabled]}
        disabled={!materialDraft.itemName.trim()}
        onPress={() => {
          if (!materialDraft.itemName.trim()) return
          setFormData((f) => ({
            ...f,
            materialsBought: [
              ...f.materialsBought,
              {
                id: `mat_${Date.now()}`,
                itemName: materialDraft.itemName,
                description: materialDraft.description,
                reason: materialDraft.reason,
                cost: parseFloat(materialDraft.cost) || 0
              }
            ]
          }))
          setMaterialDraft({ itemName: '', description: '', reason: '', cost: '' })
        }}
      >
        <Text style={formStyles.primaryBtnText}>+ Add material</Text>
      </Pressable>

      {formData.materialsBought.length ? (
        <>
          {formData.materialsBought.map((m) => (
            <View key={m.id} style={styles.matRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.matTitle}>{m.itemName}</Text>
                {m.description ? <Text style={styles.matSub}>{m.description}</Text> : null}
                {m.reason ? <Text style={styles.matSub}>Reason: {m.reason}</Text> : null}
                <Text style={styles.matCost}>R {m.cost.toFixed(2)}</Text>
              </View>
              <Pressable
                onPress={() =>
                  setFormData((f) => ({
                    ...f,
                    materialsBought: f.materialsBought.filter((x) => x.id !== m.id)
                  }))
                }
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total cost</Text>
            <Text style={styles.totalValue}>R {totalMaterialCost.toFixed(2)}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.hint}>No ad-hoc purchases recorded yet.</Text>
      )}
    </>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  stockRow: {
    gap: jc.space.sm,
    marginBottom: jc.space.md,
    paddingBottom: jc.space.md,
    borderBottomWidth: 1,
    borderBottomColor: jc.border
  },
  locLabel: { fontSize: 12, fontWeight: '600', color: jc.textMuted },
  locHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: { color: jc.danger, fontSize: 13, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: jc.textMuted, fontSize: 13 },
  errorText: { color: jc.warning, fontSize: 13 },
  noStockHint: { color: jc.textMuted, fontSize: 12 },
  cacheHint: { color: jc.primaryDark, fontSize: 11, fontStyle: 'italic' },
  btnDisabled: { opacity: 0.45 },
  appliedBox: { gap: jc.space.sm, marginTop: jc.space.sm },
  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: jc.space.sm,
    backgroundColor: jc.surfaceMuted,
    borderRadius: jc.radius.md,
    borderWidth: 1,
    borderColor: jc.border,
    padding: jc.space.md
  },
  appliedTitle: { fontWeight: '700', color: jc.text, fontSize: 14 },
  appliedSub: { color: jc.textMuted, fontSize: 12, marginTop: 2 },
  hint: { color: jc.textMuted, fontSize: 13, fontStyle: 'italic' },
  matRow: {
    flexDirection: 'row',
    gap: jc.space.sm,
    paddingVertical: jc.space.sm,
    borderTopWidth: 1,
    borderTopColor: jc.border
  },
  matTitle: { fontWeight: '700', color: jc.text },
  matSub: { color: jc.textMuted, fontSize: 13, marginTop: 2 },
  matCost: { fontWeight: '700', color: jc.text, marginTop: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: jc.border,
    paddingTop: jc.space.md,
    marginTop: jc.space.sm
  },
  totalLabel: { fontWeight: '700', color: jc.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: jc.primary }
  })
}