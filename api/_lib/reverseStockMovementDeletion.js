import { computedInventoryTotalValue } from './inventoryValue.js'
import {
  buildMovementId,
  findCanonicalInventoryItemBySkuTx,
  getStatusFromQuantity
} from './stockCountAdjustment.js'

function httpError(status, message) {
  const err = new Error(message)
  err.httpStatus = status
  return err
}

async function resolveAdjustmentLocationIdTx(tx, { fromLocationId, toLocationId, itemLocationId, fromStr, toStr }) {
  let locationId = fromLocationId || toLocationId || itemLocationId || null
  if (locationId) return locationId

  async function resolveStr(str) {
    const s = (str || '').trim()
    if (!s) return null
    const loc = await tx.stockLocation.findFirst({
      where: {
        OR: [{ id: s }, { code: s }, { name: { equals: s, mode: 'insensitive' } }]
      }
    })
    return loc?.id || null
  }

  locationId = await resolveStr(fromStr)
  if (locationId) return locationId
  locationId = await resolveStr(toStr)
  if (locationId) return locationId

  const mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
  if (mainWarehouse) return mainWarehouse.id

  const anyLoc = await tx.stockLocation.findFirst({ orderBy: { code: 'asc' } })
  return anyLoc?.id || null
}

async function createStockMovementTxWithRetry(tx, payload) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.stockMovement.create({
        data: {
          ...payload,
          movementId: payload.movementId || buildMovementId()
        }
      })
    } catch (error) {
      if (error?.code === 'P2002') continue
      throw error
    }
  }
  throw new Error('Could not allocate a unique movementId')
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
    toStr: movement.toLocation || ''
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
        unitCost: master?.unitCost || 0,
        reorderPoint: master?.reorderPoint || 0,
        status: 'out_of_stock'
      }
    })
  }

  const newLocQty = (li.quantity || 0) + reverseQty
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

  await createStockMovementTxWithRetry(tx, {
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
