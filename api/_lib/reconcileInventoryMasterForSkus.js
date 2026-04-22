import { computedInventoryTotalValue } from './inventoryValue.js'
import { findCanonicalInventoryItemBySkuTx, getStatusFromQuantity } from './stockCountAdjustment.js'

/**
 * For each SKU, set canonical InventoryItem.quantity (and value/status) to the sum of
 * LocationInventory.quantity for that SKU. Use after ledger-only changes to remove drift.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} skus
 * @returns {Promise<Array<{ sku: string, before: number, after: number }>>}
 */
export async function reconcileInventoryMasterForSkus(prisma, skus) {
  const unique = [...new Set((skus || []).map((s) => String(s || '').trim()).filter(Boolean))]
  const updates = []

  for (const sku of unique) {
    const row = await prisma.$transaction(async (tx) => {
      const sumRow = await tx.locationInventory.aggregate({
        where: { sku },
        _sum: { quantity: true }
      })
      const agg = sumRow._sum.quantity ?? 0
      const masters = await tx.inventoryItem.findMany({
        where: { sku },
        orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
      })
      if (!masters.length) return null
      const canonical = await findCanonicalInventoryItemBySkuTx(tx, sku)
      const before = canonical?.quantity ?? 0
      let changed = false
      for (const m of masters) {
        if (Math.abs(agg - (m.quantity ?? 0)) < 0.0001) continue
        await tx.inventoryItem.update({
          where: { id: m.id },
          data: {
            quantity: agg,
            totalValue: computedInventoryTotalValue(agg, m.unitCost || 0),
            status: getStatusFromQuantity(agg, m.reorderPoint || 0)
          }
        })
        changed = true
      }
      if (!changed) return null
      if (Math.abs(before - agg) < 0.0001) return null
      return { sku, before, after: agg }
    })
    if (row) updates.push(row)
  }

  return updates
}
