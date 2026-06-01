import { computedInventoryTotalValue } from './inventoryValue.js'

/** Round unit cost to 4 decimal places (WAC precision). */
export function roundUnitCost(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

/**
 * Weighted average unit cost: (oldQty×oldCost + inboundQty×inboundPrice) / (oldQty + inboundQty).
 * inboundQty <= 0 or inboundPrice <= 0 → keep oldCost; oldQty <= 0 → inboundPrice.
 */
export function computeWeightedAverageUnitCost(oldQty, oldCost, inboundQty, inboundPrice) {
  const oq = Number(oldQty) || 0
  const oc = Number(oldCost) || 0
  const iq = Number(inboundQty) || 0
  const ip = Number(inboundPrice) || 0

  if (iq <= 0) return roundUnitCost(oc)
  if (ip <= 0) return roundUnitCost(oc)
  if (oq <= 0) return roundUnitCost(ip)

  return roundUnitCost((oq * oc + iq * ip) / (oq + iq))
}

export async function findCanonicalInventoryItemBySkuTx(tx, sku) {
  if (!sku) return null
  const rows = await tx.inventoryItem.findMany({
    where: { sku: String(sku).trim() },
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  return rows[0] || null
}

/** Company on-hand qty (sum of LocationInventory) before an inbound delta. */
export async function getOnHandQtyForSkuTx(tx, sku) {
  const agg = await tx.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku: String(sku).trim() }
  })
  return agg._sum.quantity || 0
}

/**
 * Update catalog unitCost (WAC) and last inbound price for all InventoryItem rows for SKU.
 * Caller should apply location qty delta afterward and re-aggregate quantity + totalValue.
 */
export async function applyCatalogWeightedAverageCostTx(
  tx,
  { sku, inboundQty, inboundUnitPrice, inboundAt = new Date() }
) {
  const skuNorm = String(sku).trim()
  const canonical = await findCanonicalInventoryItemBySkuTx(tx, skuNorm)
  const onHandBefore = await getOnHandQtyForSkuTx(tx, skuNorm)
  const oldCost = Number(canonical?.unitCost) || 0
  const iq = Number(inboundQty) || 0
  const ip = Number(inboundUnitPrice) || 0
  const newUnitCost = computeWeightedAverageUnitCost(onHandBefore, oldCost, iq, ip)

  const data = { unitCost: newUnitCost }
  if (iq > 0 && ip > 0) {
    data.lastInboundUnitPrice = ip
    data.lastInboundAt = inboundAt instanceof Date ? inboundAt : new Date(inboundAt)
  }

  await tx.inventoryItem.updateMany({
    where: { sku: skuNorm },
    data
  })

  return {
    newUnitCost,
    previousUnitCost: oldCost,
    lastInboundUnitPrice: iq > 0 && ip > 0 ? ip : Number(canonical?.lastInboundUnitPrice) || 0,
    onHandBefore
  }
}

/** Recompute totalValue on canonical row after qty aggregate (post inbound). */
export async function syncCatalogTotalValueForSkuTx(tx, sku, aggQty, unitCost) {
  const canonical = await findCanonicalInventoryItemBySkuTx(tx, sku)
  if (!canonical) return null
  const uc = unitCost != null ? Number(unitCost) : Number(canonical.unitCost) || 0
  const qty =
    aggQty != null && aggQty !== ''
      ? Number(aggQty)
      : Number(canonical.quantity) || 0
  const rp = canonical.reorderPoint || 0
  const status = qty > rp ? 'in_stock' : qty > 0 ? 'low_stock' : 'out_of_stock'
  return tx.inventoryItem.update({
    where: { id: canonical.id },
    data: {
      quantity: qty,
      unitCost: uc,
      totalValue: computedInventoryTotalValue(qty, uc),
      status
    }
  })
}
