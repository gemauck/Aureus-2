// Public API endpoint for job card form - returns inventory items without authentication
import { assertPublicFieldAccess } from '../_lib/securityGuards.js'
import { prisma } from '../_lib/prisma.js'
import { catalogUnitCostForSku } from '../_lib/inventoryCatalogUnitCost.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

const TEMPLATE_SELECT = {
  id: true,
  sku: true,
  name: true,
  thumbnail: true,
  unitCost: true,
  unit: true,
  category: true,
  type: true,
  status: true,
  quantity: true
}

const THUMBNAIL_BATCH_MAX = 60

/** Inline data URLs are omitted from large pick lists; fetch via ?thumbnails=SKU1,SKU2. */
function thumbnailFieldsForList(template, { compact }) {
  const raw = String(template?.thumbnail || '').trim()
  if (!raw) return { thumbnail: '', hasThumbnail: false }
  if (!compact) return { thumbnail: raw, hasThumbnail: true }
  if (/^https?:\/\//i.test(raw)) return { thumbnail: raw, hasThumbnail: true }
  return { thumbnail: '', hasThumbnail: true }
}

async function loadThumbnailsBySku(skus) {
  const unique = [...new Set(skus.map((s) => String(s).trim()).filter(Boolean))].slice(0, THUMBNAIL_BATCH_MAX)
  if (!unique.length) return {}
  const items = await prisma.inventoryItem.findMany({
    where: { sku: { in: unique }, status: { not: 'inactive' } },
    select: { sku: true, thumbnail: true },
    orderBy: { updatedAt: 'desc' }
  })
  const out = {}
  for (const item of items) {
    const sku = item.sku?.trim()
    if (!sku || out[sku]) continue
    const thumb = String(item.thumbnail || '').trim()
    if (thumb) out[sku] = thumb
  }
  return out
}

/** One canonical template per SKU (newest row wins) for merging global catalog into a location view. */
async function loadGlobalActiveInventoryTemplatesBySku() {
  const items = await prisma.inventoryItem.findMany({
    where: { status: { not: 'inactive' } },
    select: TEMPLATE_SELECT,
    orderBy: { updatedAt: 'desc' }
  })
  const bySku = new Map()
  for (const item of items) {
    const sku = item.sku?.trim()
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, item)
  }
  return bySku
}

/**
 * Stock on hand at one warehouse (for public job card "Stock used" picker).
 * Read-only: does not seed LocationInventory rows.
 * @param {{ includeZero?: boolean, allSystemSkus?: boolean }} [options] — includeZero: zero on-hand rows; allSystemSkus: every active catalog SKU at this location (qty 0 if none).
 */
async function inventoryForLocation(locationId, options = {}) {
  const includeZero = options.includeZero === true || options.allSystemSkus === true
  const allSystemSkus = options.allSystemSkus === true
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
      unitCost: catalogUnitCostForSku(item),
      name: item.name || item.sku,
      status: item.status || 'in_stock'
    })
  }

  for (const record of records) {
    const sku = record.sku
    if (!sku) continue
    const template = bySku.get(sku) || {}
    if (template.status === 'inactive' && !allSystemSkus) continue

    const currentQty = Number(record.quantity) || 0
    const existing = bySkuAggregate.get(sku)
    if (!existing) {
      bySkuAggregate.set(sku, {
        template,
        sku,
        quantity: currentQty,
        unitCost: catalogUnitCostForSku(template),
        name: template.name || record.itemName || sku,
        status: template.status || record.status || 'in_stock'
      })
      continue
    }

    existing.quantity += currentQty
    existing.unitCost = catalogUnitCostForSku(template)
    if (!existing.name && (record.itemName || template.name)) {
      existing.name = template.name || record.itemName || sku
    }
  }

  if (allSystemSkus) {
    const globalTemplates = await loadGlobalActiveInventoryTemplatesBySku()
    for (const [sku, template] of globalTemplates) {
      if (bySkuAggregate.has(sku)) continue
      bySkuAggregate.set(sku, {
        template,
        sku,
        quantity: 0,
        unitCost: catalogUnitCostForSku(template),
        name: template.name || sku,
        status: template.status || 'in_stock'
      })
    }
  }

  const out = []
  for (const aggregate of bySkuAggregate.values()) {
    if (!includeZero && (Number(aggregate.quantity) || 0) <= 0) continue
    const thumbFields = thumbnailFieldsForList(aggregate.template, { compact: allSystemSkus })
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
      status: aggregate.status,
      thumbnail: thumbFields.thumbnail,
      hasThumbnail: thumbFields.hasThumbnail
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
  if (!assertPublicFieldAccess(req, res)) return

  try {
    const rawThumbSkus = req.query?.thumbnails
    if (rawThumbSkus != null && String(rawThumbSkus).trim() !== '') {
      const skus = String(rawThumbSkus)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const thumbnails = await loadThumbnailsBySku(skus)
      return ok(res, { thumbnails })
    }

    const rawLoc = req.query?.locationId
    const locationId = typeof rawLoc === 'string' ? rawLoc.trim() : ''
    const rawIncludeZero = req.query?.includeZero
    const includeZero =
      rawIncludeZero === '1' ||
      String(rawIncludeZero || '')
        .trim()
        .toLowerCase() === 'true'
    const rawAllSkus = req.query?.allSkus
    const allSkus =
      rawAllSkus === '1' ||
      String(rawAllSkus || '')
        .trim()
        .toLowerCase() === 'true'

    const rawResolveItemId = req.query?.resolveItemId
    const resolveItemId =
      typeof rawResolveItemId === 'string' ? rawResolveItemId.trim() : ''
    if (resolveItemId) {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: resolveItemId },
        select: { id: true, sku: true, name: true, status: true }
      })
      if (!item) {
        return ok(res, { item: null })
      }
      const sku = String(item.sku || '').trim()
      if (!sku) {
        return ok(res, { item: null })
      }
      return ok(res, {
        item: {
          inventoryItemId: item.id,
          sku,
          name: String(item.name || '').trim(),
          status: item.status || ''
        }
      })
    }

    if (locationId && locationId !== 'all') {
      const rows = await inventoryForLocation(locationId, {
        includeZero: includeZero || allSkus,
        allSystemSkus: allSkus
      })
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

    const deduped = dedupeInventoryItemsBySku(items).map((item) => {
      const thumbFields = thumbnailFieldsForList(item, { compact: true })
      return { ...item, thumbnail: thumbFields.thumbnail, hasThumbnail: thumbFields.hasThumbnail }
    })

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
