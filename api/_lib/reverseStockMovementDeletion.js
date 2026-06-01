import { computedInventoryTotalValue } from './inventoryValue.js'
import {
  findCanonicalInventoryItemBySkuTx,
  getStatusFromQuantity
} from './stockCountAdjustment.js'
import { createStockMovementTx } from './movementId.js'
import { resolveAdjustmentLocationIdTx } from './adjustmentLocation.js'

function httpError(status, message) {
  const err = new Error(message)
  err.httpStatus = status
  return err
}

/**
 * Reverses LocationInventory + master InventoryItem for removing `movement` from the ledger.
 * Does not delete the row or write a compensating StockMovement.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {import('@prisma/client').StockMovement} movement
 * @param {string} id - StockMovement primary key (for error messages)
 */
async function applyInventoryReversalForRemovedMovementTx(tx, movement, id) {
  const reverseQty = -1 * (parseFloat(movement.quantity) || 0)
  const sku = movement.sku
  const itemName = movement.itemName
  const now = new Date()

  const master = await findCanonicalInventoryItemBySkuTx(tx, sku)
  const locationId = await resolveAdjustmentLocationIdTx(tx, {
    fromLocationId: movement.fromLocation || null,
    toLocationId: movement.toLocation || null,
    itemLocationId: master?.locationId || null,
    fromStr: movement.fromLocation || '',
    toStr: movement.toLocation || '',
    quantity: movement.quantity
  })

  if (!locationId) {
    throw httpError(400, 'No stock location configured. Cannot safely reverse this movement.')
  }

  let li = await tx.locationInventory.findUnique({
    where: { locationId_sku: { locationId, sku } }
  })
  if (!li) {
    li = await tx.locationInventory.create({
      data: {
        locationId,
        sku,
        itemName: itemName || sku,
        quantity: 0,
        reorderPoint: master?.reorderPoint || 0,
        status: 'out_of_stock'
      }
    })
  }

  let newLocQty = (li.quantity || 0) + reverseQty

  // Legacy safety: some historic movements were saved without stable location ids.
  // If the resolved row would go negative, find another row for this SKU that can
  // absorb the reversal (typically where the original import quantity currently sits).
  if (newLocQty < 0) {
    const fallbackRows = await tx.locationInventory.findMany({
      where: { sku },
      orderBy: [{ quantity: 'desc' }, { updatedAt: 'desc' }]
    })

    const fallback = fallbackRows.find((row) => ((row.quantity || 0) + reverseQty) >= 0)
    if (fallback) {
      li = fallback
      newLocQty = (li.quantity || 0) + reverseQty
    }
  }

  if (newLocQty < 0) {
    throw httpError(
      400,
      `Cannot delete movement ${movement.movementId || id}: reversal would make stock negative at location`
    )
  }

  await tx.locationInventory.update({
    where: { id: li.id },
    data: {
      quantity: newLocQty,
      status: getStatusFromQuantity(newLocQty, li.reorderPoint || 0),
      lastRestocked: reverseQty > 0 ? now : li.lastRestocked
    }
  })

  if (master) {
    const totalAtLocations = await tx.locationInventory.aggregate({
      _sum: { quantity: true },
      where: { sku }
    })
    const aggQty = totalAtLocations._sum.quantity || 0
    await tx.inventoryItem.update({
      where: { id: master.id },
      data: {
        quantity: aggQty,
        totalValue: computedInventoryTotalValue(aggQty, master.unitCost || 0),
        status: getStatusFromQuantity(aggQty, master.reorderPoint || 0)
      }
    })
  }
}

/**
 * Remove an adjustment-only movement and reverse inventory without writing a compensating ledger row.
 * For correcting mistaken duplicate adjustments (admin / one-off tooling).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} id - StockMovement primary key (cuid)
 */
/**
 * Remove a movement and reverse inventory without a compensating ledger row.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} id - StockMovement primary key (cuid)
 * @param {{ allowedTypes?: string[] }} [opts]
 */
export async function purgeStockMovementTx(tx, id, opts = {}) {
  const allowedTypes = opts.allowedTypes || ['adjustment', 'consumption']
  const movement = await tx.stockMovement.findUnique({ where: { id } })
  if (!movement) throw httpError(404, 'Stock movement not found')
  const t = String(movement.type || '').toLowerCase()
  if (!allowedTypes.includes(t)) {
    throw httpError(400, `purgeStockMovementTx only supports: ${allowedTypes.join(', ')}`)
  }
  await applyInventoryReversalForRemovedMovementTx(tx, movement, id)
  await tx.stockMovement.delete({ where: { id } })
}

export async function purgeAdjustmentStockMovementTx(tx, id) {
  return purgeStockMovementTx(tx, id, { allowedTypes: ['adjustment'] })
}

/**
 * Same behavior as DELETE /api/manufacturing/stock-movements/:id — reverses qty at location,
 * updates master inventory, writes auto-reversal movement, deletes original row.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} id - StockMovement primary key (cuid)
 * @param {string} performedBy
 */
export async function reverseStockMovementDeletionTx(tx, id, performedBy = 'System') {
  const movement = await tx.stockMovement.findUnique({ where: { id } })
  if (!movement) throw httpError(404, 'Stock movement not found')

  const now = new Date()
  await applyInventoryReversalForRemovedMovementTx(tx, movement, id)

  const reverseQty = -1 * (parseFloat(movement.quantity) || 0)
  await createStockMovementTx(tx, {
    date: now,
    type: 'adjustment',
    itemName: movement.itemName,
    sku: movement.sku,
    quantity: reverseQty,
    fromLocation: movement.fromLocation || '',
    toLocation: movement.toLocation || '',
    reference: movement.reference || '',
    performedBy,
    notes: `Auto-reversal for deleted movement ${movement.movementId || id}`,
    ownerId: null
  })

  await tx.stockMovement.delete({ where: { id } })
}
