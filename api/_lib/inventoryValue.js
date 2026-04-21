/**
 * Persisted and displayed extended inventory value: quantity × unit cost for that item row.
 */
export function computedInventoryTotalValue(quantity, unitCost) {
  const raw = (Number(quantity) || 0) * (Number(unitCost) || 0)
  return Math.round((raw + Number.EPSILON) * 100) / 100
}
