// Public API endpoint for job card form - returns inventory items without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

const TEMPLATE_SELECT = {
  id: true,
  sku: true,
  name: true,
  unitCost: true,
  unit: true,
  category: true,
  type: true,
  status: true,
  quantity: true
}

/**
 * Stock on hand at one warehouse (for public job card "Stock used" picker).
 * Read-only: does not seed LocationInventory rows.
 * @param {{ includeZero?: boolean }} [options] — when true, include SKUs with zero on-hand (e.g. stock-take).
 */
async function inventoryForLocation(locationId, options = {}) {
  const includeZero = options.includeZero === true
  if (!locationId) {
    return []
  }

  const location = await prisma.stockLocation.findUnique({
    where: { id: locationId }
  })
  if (!location) {
    return []
  }

  const records = await prisma.locationInventory.findMany({
    where: { locationId },
    orderBy: { itemName: 'asc' }
  })

  // Some locations still rely on catalog rows (InventoryItem.locationId) while
  // others use LocationInventory as source of truth. Merge both so the stock
  // picker shows the full selected-location stock list.
  const catalogAtLocation = await prisma.inventoryItem.findMany({
    where: {
      locationId,
      status: { not: 'inactive' }
    },
    select: TEMPLATE_SELECT,
    orderBy: { updatedAt: 'desc' }
  })

  const skuList = [...new Set(records.map((r) => r.sku).filter(Boolean))]
  const templates = skuList.length
    ? await prisma.inventoryItem.findMany({
        where: { sku: { in: skuList } },
        select: TEMPLATE_SELECT,
        orderBy: { updatedAt: 'desc' }
      })
    : []

  const bySku = new Map()
  for (const t of catalogAtLocation) {
    if (t?.sku && !bySku.has(t.sku)) {
      bySku.set(t.sku, t)
    }
  }
  for (const t of templates) {
    if (!bySku.has(t.sku)) {
      bySku.set(t.sku, t)
    }
  }

  // Aggregate by SKU so the picker shows total on-hand per component at this location.
  const bySkuAggregate = new Map()
  const locationInventorySkuSet = new Set(records.map((record) => record.sku).filter(Boolean))

  // Seed from per-location catalog rows when no LocationInventory row exists for the SKU.
  for (const item of catalogAtLocation) {
    if (!item?.sku || locationInventorySkuSet.has(item.sku)) continue
    bySkuAggregate.set(item.sku, {
      template: item,
      sku: item.sku,
      quantity: Number(item.quantity) || 0,
      unitCost: item.unitCost ?? 0,
      name: item.name || item.sku,
      status: item.status || 'in_stock'
    })
  }

  for (const record of records) {
    const sku = record.sku
    if (!sku) continue
    const template = bySku.get(sku) || {}
    if (template.status === 'inactive') continue

    const currentQty = Number(record.quantity) || 0
    const existing = bySkuAggregate.get(sku)
    if (!existing) {
      bySkuAggregate.set(sku, {
        template,
        sku,
        quantity: currentQty,
        unitCost: record.unitCost ?? template.unitCost ?? 0,
        name: template.name || record.itemName || sku,
        status: template.status || record.status || 'in_stock'
      })
      continue
    }

    existing.quantity += currentQty
    // Keep non-zero/defined unit cost if available on later rows.
    if (record.unitCost != null) existing.unitCost = record.unitCost
    if (!existing.name && (record.itemName || template.name)) {
      existing.name = template.name || record.itemName || sku
    }
  }

  const out = []
  for (const aggregate of bySkuAggregate.values()) {
    if (!includeZero && (Number(aggregate.quantity) || 0) <= 0) continue
    out.push({
      ...aggregate.template,
      id: `${aggregate.sku}-${locationId}`,
      inventoryItemId: aggregate.template.id || null,
      sku: aggregate.sku,
      name: aggregate.name,
      quantity: aggregate.quantity,
      unitCost: aggregate.unitCost,
      locationId,
      unit: aggregate.template.unit || 'pcs',
      category: aggregate.template.category || null,
      type: aggregate.template.type || null,
      status: aggregate.status
    })
  }

  out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return out
}

/** Merge duplicate catalog rows that share a SKU (same part stored per location as separate InventoryItem rows). */
function dedupeInventoryItemsBySku(items) {
  if (!Array.isArray(items)) return []
  const bySku = new Map()
  for (const item of items) {
    if (!item) continue
    const sku = String(item.sku || '').trim()
    if (!sku) continue
    const prev = bySku.get(sku)
    const qty = Number(item.quantity) || 0
    if (!prev) {
      bySku.set(sku, { ...item, sku, quantity: qty })
      continue
    }
    prev.quantity = (Number(prev.quantity) || 0) + qty
  }
  const merged = Array.from(bySku.values())
  merged.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  )
  return merged
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawLoc = req.query?.locationId
    const locationId = typeof rawLoc === 'string' ? rawLoc.trim() : ''
    const rawIncludeZero = req.query?.includeZero
    const includeZero =
      rawIncludeZero === '1' ||
      String(rawIncludeZero || '')
        .trim()
        .toLowerCase() === 'true'

    if (locationId && locationId !== 'all') {
      const rows = await inventoryForLocation(locationId, { includeZero })
      return ok(res, {
        inventory: rows,
        count: rows.length
      })
    }

    // All active inventory items (aggregate / catalog — no per-location breakdown)
    const items = await prisma.inventoryItem.findMany({
      where: {
        status: {
          not: 'inactive'
        }
      },
      select: TEMPLATE_SELECT,
      orderBy: {
        name: 'asc'
      }
    })

    const deduped = dedupeInventoryItemsBySku(items)

    return ok(res, {
      inventory: deduped,
      count: deduped.length
    })
  } catch (error) {
    console.error('❌ Public inventory endpoint error:', error)
    return serverError(res, 'Failed to fetch inventory', error.message)
  }
}

export default withHttp(handler)
