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
 */
async function inventoryForLocation(locationId) {
  if (!locationId || locationId === 'all') {
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
  if (!records.length) {
    return []
  }

  const skuList = [...new Set(records.map((r) => r.sku).filter(Boolean))]
  if (!skuList.length) {
    return []
  }

  const templates = await prisma.inventoryItem.findMany({
    where: { sku: { in: skuList } },
    select: TEMPLATE_SELECT,
    orderBy: { updatedAt: 'desc' }
  })

  const bySku = new Map()
  for (const t of templates) {
    if (!bySku.has(t.sku)) {
      bySku.set(t.sku, t)
    }
  }

  const out = []
  for (const record of records) {
    const template = bySku.get(record.sku) || {}
    if (template.status === 'inactive') {
      continue
    }
    const quantity = record.quantity ?? 0
    if (quantity <= 0) {
      continue
    }
    const unitCost = record.unitCost ?? template.unitCost ?? 0
    out.push({
      ...template,
      id: `${record.id}-${locationId}`,
      inventoryItemId: template.id || null,
      sku: record.sku,
      name: template.name || record.itemName || record.sku,
      quantity,
      unitCost,
      locationId,
      unit: template.unit || 'pcs',
      category: template.category || null,
      type: template.type || null,
      status: template.status || record.status || 'in_stock'
    })
  }

  out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return out
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawLoc = req.query?.locationId
    const locationId = typeof rawLoc === 'string' ? rawLoc.trim() : ''

    if (locationId) {
      const rows = await inventoryForLocation(locationId)
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

    return ok(res, {
      inventory: items,
      count: items.length
    })
  } catch (error) {
    console.error('❌ Public inventory endpoint error:', error)
    return serverError(res, 'Failed to fetch inventory', error.message)
  }
}

export default withHttp(handler)
