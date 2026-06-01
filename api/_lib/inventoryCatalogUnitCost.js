import { computedInventoryTotalValue } from './inventoryValue.js'

/** One unit price per SKU: catalog (`InventoryItem`) only. */
export function catalogUnitCostForSku(template) {
  const n = Number(template?.unitCost)
  return Number.isFinite(n) ? n : 0
}

/** @deprecated Legacy orphan fallback — only for regression tests. */
export function legacyCatalogUnitCostForSku(template, locationRecord) {
  if (template?.id) {
    const n = Number(template.unitCost)
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(locationRecord?.unitCost)
  return Number.isFinite(n) ? n : 0
}

export function inventoryLineValueForLocationRow(template, locationRecord, quantity) {
  const unitCost = catalogUnitCostForSku(template)
  return {
    unitCost,
    totalValue: computedInventoryTotalValue(quantity, unitCost)
  }
}

/**
 * Dashboard-style per-location rollup (same rules as buildInventoryLocationValueSummary).
 */
export function sumLocationInventoryValueByCatalogCost(locationRows, templateBySku, unitCostBySku = null) {
  let grandTotal = 0
  for (const record of locationRows) {
    const sku = record.sku
    if (!sku) continue
    const template = templateBySku.get(sku) || {}
    const unitCost =
      unitCostBySku?.get(sku) ?? catalogUnitCostForSku(template)
    grandTotal += computedInventoryTotalValue(record.quantity ?? 0, unitCost)
  }
  return grandTotal
}
