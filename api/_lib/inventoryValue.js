/**
 * Persisted and displayed extended inventory value: quantity × unit cost for that item row.
 */
export function computedInventoryTotalValue(quantity, unitCost) {
  return (Number(quantity) || 0) * (Number(unitCost) || 0)
}
