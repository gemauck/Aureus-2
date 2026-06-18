import { assertValidTransferLocations } from './stockMovementTransfer.js'
import {
  buildMovementId,
  findCanonicalInventoryItemBySkuTx
} from './stockCountAdjustment.js'
import { applyLocationInventoryDeltaTx } from './locationInventoryQty.js'
import { computedInventoryTotalValue } from './inventoryValue.js'

/**
 * Execute one inter-location stock transfer inside an existing transaction.
 * @returns {Promise<{ movement: object }>}
 */
export async function executeStockTransferTx(tx, {
  sku,
  itemName,
  quantity,
  fromLocationId,
  toLocationId,
  performedBy = 'System',
  reference = '',
  notes = '',
  date = null
}) {
  const skuNorm = String(sku || '').trim()
  const itemNameNorm = String(itemName || skuNorm).trim()
  const qty = Math.abs(parseFloat(quantity))
  if (!skuNorm || !itemNameNorm) {
    throw new Error('sku and itemName are required for transfer')
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('quantity must be a positive number')
  }

  assertValidTransferLocations(fromLocationId, toLocationId)

  const fromLi = await tx.locationInventory.findUnique({
    where: { locationId_sku: { locationId: fromLocationId, sku: skuNorm } }
  })
  if (!fromLi || (fromLi.quantity || 0) < qty) {
    throw new Error(`Insufficient stock at source location for ${skuNorm}`)
  }

  const movementId = buildMovementId()
  const movementRestockedAt = date ? new Date(date) : new Date()

  const movement = await tx.stockMovement.create({
    data: {
      movementId,
      date: movementRestockedAt,
      type: 'transfer',
      itemName: itemNameNorm,
      sku: skuNorm,
      quantity: qty,
      fromLocation: fromLocationId,
      toLocation: toLocationId,
      reference: String(reference || '').trim(),
      performedBy: String(performedBy || 'System').trim(),
      notes: String(notes || '').trim(),
      ownerId: null
    }
  })

  await applyLocationInventoryDeltaTx(tx, fromLocationId, skuNorm, itemNameNorm, -qty)
  await applyLocationInventoryDeltaTx(tx, toLocationId, skuNorm, itemNameNorm, qty, {
    lastRestocked: movementRestockedAt
  })

  const item = await findCanonicalInventoryItemBySkuTx(tx, skuNorm)
  if (item) {
    const totalAtLocations = await tx.locationInventory.aggregate({
      _sum: { quantity: true },
      where: { sku: skuNorm }
    })
    const aggQty = totalAtLocations._sum.quantity || 0
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantity: aggQty,
        totalValue: computedInventoryTotalValue(aggQty, item.unitCost),
        status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : aggQty > 0 ? 'low_stock' : 'out_of_stock'
      }
    })
  }

  return { movement }
}
