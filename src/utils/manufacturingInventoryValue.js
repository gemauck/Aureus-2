/**
 * Manufacturing inventory valuation helpers — match API list rules:
 * prefer server `totalValue`, else quantity × unitCost.
 * Use {@link inventoryRowTotalValueForQuantity} when UI shows a quantity slice (e.g. one location)
 * that may differ from `item.quantity`.
 */

export function inventoryLineTotalValue(quantity, unitCost) {
  return (Number(quantity) || 0) * (Number(unitCost) || 0);
}

export function normalizeInventoryItemRow(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    totalValue:
      item.totalValue !== undefined && item.totalValue !== null
        ? Number(item.totalValue) || 0
        : inventoryLineTotalValue(item.quantity, item.unitCost)
  };
}

/**
 * Prefer API `totalValue` only when it applies to the same quantity as `item.quantity`.
 * When showing a different quantity (location breakdown), recompute at unit cost.
 */
export function inventoryRowTotalValueForQuantity(item, quantityForValue) {
  if (!item || typeof item !== 'object') return 0;
  const q = Number(quantityForValue);
  const rowQty = Number(item.quantity) || 0;
  if (!Number.isFinite(q)) return Number(normalizeInventoryItemRow(item).totalValue) || 0;
  if (Math.abs(q - rowQty) < 1e-6) return Number(normalizeInventoryItemRow(item).totalValue) || 0;
  return inventoryLineTotalValue(q, item.unitCost);
}
