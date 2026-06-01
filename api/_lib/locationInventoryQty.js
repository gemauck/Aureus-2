import { getStatusFromQuantity } from './stockCountAdjustment.js'

/**
 * Apply a quantity delta to LocationInventory (on-hand only).
 * Unit cost lives on InventoryItem (catalog) — not on location rows.
 */
export async function applyLocationInventoryDeltaTx(
  tx,
  locationId,
  sku,
  itemName,
  quantityDelta,
  { reorderPoint, lastRestocked } = {}
) {
  if (!locationId) return null

  let li = await tx.locationInventory.findUnique({
    where: { locationId_sku: { locationId, sku } }
  })

  if (!li) {
    const rp = reorderPoint ?? 0
    li = await tx.locationInventory.create({
      data: {
        locationId,
        sku,
        itemName: itemName || sku,
        quantity: 0,
        reorderPoint: rp,
        status: 'out_of_stock'
      }
    })
  }

  const newQty = (li.quantity || 0) + quantityDelta
  const rp = reorderPoint !== undefined ? reorderPoint : li.reorderPoint || 0
  const data = {
    quantity: newQty,
    status: getStatusFromQuantity(newQty, rp),
    itemName: itemName || li.itemName
  }
  if (reorderPoint !== undefined) data.reorderPoint = reorderPoint
  if (lastRestocked !== undefined) {
    data.lastRestocked = lastRestocked
  } else if (quantityDelta > 0) {
    data.lastRestocked = new Date()
  }

  return tx.locationInventory.update({
    where: { id: li.id },
    data
  })
}
