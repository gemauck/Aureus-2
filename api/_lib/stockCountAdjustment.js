import { computedInventoryTotalValue } from './inventoryValue.js'
import { applyLocationInventoryDeltaTx } from './locationInventoryQty.js'

/**
 * Stock-count location semantics (movements vs on-hand):
 *
 * - **Current pipeline** (`applyStockCountAdjustmentTx`, template import, stock-take apply): creates
 *   `StockMovement` with `fromLocation` = **location UUID**, `toLocation` = `''`, and **always** upserts
 *   `LocationInventory` at that `locationId` (and updates `InventoryItem` aggregates).
 *
 * - **Legacy** `scripts/import-stock-count-excel.js` (`reference: STOCK_COUNT_IMPORT`): wrote
 *   `toLocation` = **location code** (e.g. `"PMB"`), `fromLocation` = `''`. It also created
 *   `InventoryItem` + `LocationInventory` when the row succeeded. If catalog / per-location rows were
 *   removed later, movements can remain **without** matching `LocationInventory` — the ledger may show
 *   history while the location stock list shows nothing for that SKU.
 *
 * - **`PMB` vs Piet office**: `StockLocation` with code **`PMB`** is not the same row as **`01_LOC1`**
 *   (PIETERMARITZBURG OFFICE). Legacy imports resolve `"PMB"` via `ensureLocation` → the **`PMB`** site.
 *
 * - **Backfill movement strings** to UUIDs (so per-location ledger filters match):
 *   `node scripts/backfill-stock-movement-location-ids.js` (dry run) then `--write`.
 *
 * - **New writes (Option B):** sales shipments, PO receipts, manufacturing bulk/initial balance,
 *   production completion, and incremental production consume persist **location UUIDs** in
 *   `fromLocation` / `toLocation` where applicable (not location codes).
 */

export const getStatusFromQuantity = (quantity = 0, reorderPoint = 0) => {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

export { buildMovementId, createStockMovementTx } from './movementId.js'
import { buildMovementId } from './movementId.js'

export async function findCanonicalInventoryItemBySkuTx(tx, sku) {
  if (!sku) return null
  const rows = await tx.inventoryItem.findMany({
    where: { sku },
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })
  return rows[0] || null
}

function normalizeStockCountCategory(val) {
  if (!val) return 'components'
  const v = String(val).trim().toLowerCase().replace(/\s+/g, '_')
  const ok = [
    'components',
    'accessories',
    'finished_goods',
    'raw_materials',
    'work_in_progress',
    'packaging'
  ]
  return ok.includes(v) ? v : 'components'
}

function normalizeStockCountItemType(val) {
  if (!val) return 'component'
  const v = String(val).trim().toLowerCase()
  if (v === 'final_product' || v.includes('final') || v.includes('product')) return 'final_product'
  return 'component'
}

export async function allocateStockCountSkuTx(tx) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase()
    const sku = `SC-${suffix}`.slice(0, 80)
    const exists = await tx.inventoryItem.findFirst({ where: { sku }, select: { id: true } })
    if (!exists) return sku
  }
  throw new Error('Could not allocate a unique stock-count SKU')
}

/**
 * Apply one adjustment at a location: StockMovement row, LocationInventory delta, InventoryItem aggregate.
 * Mirrors POST stock-movements adjustment branch for use by stock-count import.
 */
export async function applyStockCountAdjustmentTx(tx, params) {
  const {
    req,
    sku,
    itemName,
    quantityDelta,
    locationId,
    reference,
    notes,
    unitCost = 0,
    reorderPoint = 0,
    reorderQty = 0,
    unit = 'pcs',
    category = 'components',
    itemType = 'component',
    needsCatalogReview = false,
    importDate = null,
    supplier = '',
    supplierPartNumbers = '[]',
    legacyPartNumber = '',
    manufacturingPartNumber = '',
    boxNumber = ''
  } = params

  if (!locationId) throw new Error('locationId required')
  if (!sku || !String(sku).trim()) throw new Error('sku required')
  if (quantityDelta === 0) return { movement: null, item: null }

  const movementId = buildMovementId()
  const qty = quantityDelta
  const movDate = importDate || new Date()

  const movement = await tx.stockMovement.create({
    data: {
      movementId,
      date: movDate,
      type: 'adjustment',
      itemName: String(itemName || '').trim(),
      sku: String(sku).trim(),
      quantity: qty,
      fromLocation: locationId,
      toLocation: '',
      reference: String(reference || '').trim().slice(0, 500),
      performedBy: (req.user?.name || 'System').trim(),
      notes: String(notes || '').trim().slice(0, 2000),
      ownerId: null
    }
  })

  let item = await findCanonicalInventoryItemBySkuTx(tx, sku)
  let newQuantity = item?.quantity || 0

  if (!item) {
    if (qty < 0) {
      throw new Error(`Cannot adjust non-existent item ${sku} with negative quantity`)
    }
    const uc = parseFloat(unitCost) || 0
    const rp = parseFloat(reorderPoint) || 0
    const rq = parseFloat(reorderQty) || 0
    const totalValue = computedInventoryTotalValue(qty, uc)
    const stockLoc = await tx.stockLocation.findUnique({
      where: { id: locationId },
      select: { name: true, code: true }
    })
    const locationLabel = stockLoc
      ? `${String(stockLoc.code || '').trim()} — ${String(stockLoc.name || '').trim()}`.trim()
      : ''
    const sup = String(supplier || '').trim()
    const spnJson = String(supplierPartNumbers || '[]').trim() || '[]'
    const leg = String(legacyPartNumber || '').trim()
    const mfg = String(manufacturingPartNumber || '').trim()
    const box = String(boxNumber || '').trim()
    const cat = normalizeStockCountCategory(category)
    const typ = normalizeStockCountItemType(itemType)
    const createData = {
      sku: String(sku).trim(),
      name: String(itemName || sku).trim(),
      thumbnail: '',
      category: cat,
      type: typ,
      quantity: qty,
      unit: unit || 'pcs',
      reorderPoint: rp,
      reorderQty: rq,
      unitCost: uc,
      totalValue,
      supplier: sup,
      status: qty > rp ? 'in_stock' : qty > 0 ? 'low_stock' : 'out_of_stock',
      lastRestocked: movDate,
      ownerId: null,
      needsCatalogReview: Boolean(needsCatalogReview),
      locationId,
      location: locationLabel
    }
    try {
      item = await tx.inventoryItem.create({
        data: {
          ...createData,
          supplierPartNumbers: spnJson,
          manufacturingPartNumber: mfg,
          legacyPartNumber: leg,
          boxNumber: box
        }
      })
    } catch (createError) {
      if (
        createError.message &&
        (createError.message.includes('supplierPartNumbers') ||
          createError.message.includes('manufacturingPartNumber') ||
          createError.message.includes('legacyPartNumber') ||
          createError.message.includes('needsCatalogReview') ||
          createError.message.includes('boxNumber'))
      ) {
        const { needsCatalogReview: _n, ...fallback } = createData
        try {
          item = await tx.inventoryItem.create({
            data: {
              ...fallback,
              supplierPartNumbers: spnJson,
              manufacturingPartNumber: mfg,
              legacyPartNumber: leg,
              boxNumber: box
            }
          })
        } catch {
          item = await tx.inventoryItem.create({ data: fallback })
        }
      } else {
        throw createError
      }
    }
  } else {
    newQuantity = (item.quantity || 0) + qty
    const totalValue = computedInventoryTotalValue(newQuantity, item.unitCost)
    const rp = item.reorderPoint || 0
    const status = newQuantity > rp ? 'in_stock' : newQuantity > 0 ? 'low_stock' : 'out_of_stock'
    item = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: newQuantity, totalValue, status }
    })
  }

  await applyLocationInventoryDeltaTx(
    tx,
    locationId,
    String(sku).trim(),
    String(itemName || sku).trim(),
    qty,
    {
      reorderPoint: parseFloat(reorderPoint) || undefined,
      lastRestocked: qty > 0 ? movDate : undefined
    }
  )

  const totalAtLocations = await tx.locationInventory.aggregate({
    _sum: { quantity: true },
    where: { sku: String(sku).trim() }
  })
  const aggQty = totalAtLocations._sum.quantity || 0

  if (item) {
    item = await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantity: aggQty,
        totalValue: computedInventoryTotalValue(aggQty, item.unitCost),
        status:
          aggQty > (item.reorderPoint || 0) ? 'in_stock' : aggQty > 0 ? 'low_stock' : 'out_of_stock'
      }
    })
  }

  return { movement, item }
}
