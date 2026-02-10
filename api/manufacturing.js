import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError, forbidden } from './_lib/response.js'
import { ensureBOMMigration } from './_lib/ensureBOMMigration.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

const INVENTORY_TEMPLATE_FIELDS = {
  sku: true,
  name: true,
  thumbnail: true,
  category: true,
  type: true,
  unit: true,
  reorderPoint: true,
  reorderQty: true,
  unitCost: true,
  supplier: true,
  supplierPartNumbers: true,
  manufacturingPartNumber: true,
  legacyPartNumber: true,
  boxNumber: true,
  ownerId: true
}

const GLOBAL_LOCATION_SYNC_INTERVAL_MS = 1000 * 60 * 10 // 10 minutes
let lastGlobalLocationSync = 0
let globalSyncPromise = null

const getStatusFromQuantity = (quantity = 0, reorderPoint = 0) => {
  if (quantity > (reorderPoint || 0)) return 'in_stock'
  if (quantity > 0) return 'low_stock'
  return 'out_of_stock'
}

const buildInventoryClone = (baseItem, location, overrides = {}) => ({
  sku: baseItem.sku,
  name: baseItem.name,
  thumbnail: baseItem.thumbnail || '',
  category: baseItem.category || 'components',
  type: baseItem.type || 'component',
  quantity: overrides.quantity ?? 0,
  allocatedQuantity: overrides.allocatedQuantity ?? 0,
  inProductionQuantity: overrides.inProductionQuantity ?? 0,
  completedQuantity: overrides.completedQuantity ?? 0,
  unit: baseItem.unit || 'pcs',
  reorderPoint: baseItem.reorderPoint ?? 0,
  reorderQty: baseItem.reorderQty ?? 0,
  location: overrides.locationLabel ?? (location.name || ''),
  locationId: location.id,
  unitCost: baseItem.unitCost ?? 0,
  totalValue: overrides.totalValue ?? 0,
  supplier: baseItem.supplier || '',
  supplierPartNumbers: baseItem.supplierPartNumbers || '[]',
  manufacturingPartNumber: baseItem.manufacturingPartNumber || '',
  legacyPartNumber: baseItem.legacyPartNumber || '',
  boxNumber: baseItem.boxNumber || '',
  status: overrides.status || 'out_of_stock',
  ownerId: baseItem.ownerId || null,
  lastRestocked: overrides.lastRestocked ?? null
})

async function getInventoryTemplates() {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { updatedAt: 'desc' },
    select: INVENTORY_TEMPLATE_FIELDS
  })

  const templates = []
  const seen = new Set()

  for (const item of items) {
    if (seen.has(item.sku)) continue
    seen.add(item.sku)
    templates.push(item)
  }

  return templates
}

async function ensureLocationInventoryPlaceholder(locationId, item) {
  try {
    await prisma.locationInventory.create({
      data: {
        locationId,
        sku: item.sku,
        itemName: item.name,
        quantity: 0,
        unitCost: item.unitCost || 0,
        reorderPoint: item.reorderPoint || 0,
        status: 'out_of_stock'
      }
    })
  } catch (error) {
    if (error?.code !== 'P2002') {
      throw error
    }
  }
}

async function upsertLocationInventoryQuantity(locationId, item, quantity) {
  const status = getStatusFromQuantity(quantity, item.reorderPoint)

  await prisma.locationInventory.upsert({
    where: { locationId_sku: { locationId, sku: item.sku } },
    update: {
      itemName: item.name,
      quantity,
      unitCost: item.unitCost || 0,
      reorderPoint: item.reorderPoint || 0,
      status,
      lastRestocked: item.lastRestocked || new Date()
    },
    create: {
      locationId,
      sku: item.sku,
      itemName: item.name,
      quantity,
      unitCost: item.unitCost || 0,
      reorderPoint: item.reorderPoint || 0,
      status
    }
  })
}

async function ensureLocationHasAllInventory(location) {
  const templates = await getInventoryTemplates()
  if (!templates.length) {
    return { created: 0, total: 0 }
  }

  const existingItems = await prisma.inventoryItem.findMany({
    where: { locationId: location.id },
    select: { sku: true }
  })
  const existingSkus = new Set(existingItems.map(item => item.sku))

  let createdCount = 0

  for (const template of templates) {
    if (!existingSkus.has(template.sku)) {
      await prisma.inventoryItem.create({
        data: buildInventoryClone(template, location)
      })
      createdCount++
    }

    await ensureLocationInventoryPlaceholder(location.id, template)
  }

  return { created: createdCount, total: templates.length }
}

async function ensureItemExistsInAllLocations(item) {
  if (!item?.sku) return

  const locations = await prisma.stockLocation.findMany({
    select: { id: true, name: true }
  })

  if (!locations.length) return

  const existingItemLocations = await prisma.inventoryItem.findMany({
    where: { sku: item.sku },
    select: { locationId: true }
  })
  const existingLocationSet = new Set(existingItemLocations.map(entry => entry.locationId))

  for (const location of locations) {
    if (!location.id) continue

    if (location.id === item.locationId) {
      await upsertLocationInventoryQuantity(location.id, item, item.quantity || 0)
      continue
    }

    if (!existingLocationSet.has(location.id)) {
      await prisma.inventoryItem.create({
        data: buildInventoryClone(item, location, { quantity: 0, totalValue: 0, status: 'out_of_stock' })
      })
      existingLocationSet.add(location.id)
    }

    await ensureLocationInventoryPlaceholder(location.id, item)
  }
}

async function buildLocationInventoryResponse(locationId) {
  if (!locationId || locationId === 'all' || locationId === '') {
    return []
  }

  const location = await prisma.stockLocation.findUnique({ where: { id: locationId } })
  if (!location) {
    return []
  }

  let locationInventoryRecords = await prisma.locationInventory.findMany({
    where: { locationId },
    orderBy: { itemName: 'asc' }
  })

  if (!locationInventoryRecords.length) {
    await ensureLocationHasAllInventory(location)
    locationInventoryRecords = await prisma.locationInventory.findMany({
      where: { locationId },
      orderBy: { itemName: 'asc' }
    })
  }

  if (!locationInventoryRecords.length) {
    return []
  }

  const skuSet = new Set(locationInventoryRecords.map(record => record.sku).filter(Boolean))
  const skuList = Array.from(skuSet)

  const metadataItems = skuList.length
    ? await prisma.inventoryItem.findMany({
        where: { sku: { in: skuList } },
        orderBy: { updatedAt: 'desc' }
      })
    : []

  const metadataBySku = new Map()
  for (const meta of metadataItems) {
    if (!metadataBySku.has(meta.sku)) {
      metadataBySku.set(meta.sku, meta)
    }
  }

  return locationInventoryRecords.map(record => {
    const template = metadataBySku.get(record.sku) || {}
    const quantity = record.quantity ?? 0
    const reorderPoint = record.reorderPoint ?? template.reorderPoint ?? 0
    const unitCost = record.unitCost ?? template.unitCost ?? 0
    const baseStatus = record.status || template.status
    const status = baseStatus || getStatusFromQuantity(quantity, reorderPoint)

    return {
      // Spread the base inventory template first so we can
      //  1) preserve the original inventory item id, and
      //  2) safely override only the fields we want to be
      //     location-specific (like quantity / location label).
      ...template,

      // IMPORTANT:
      // For location-specific inventory rows we were previously
      // overloading the `id` field with a synthetic value that
      // combined the locationInventory.id and locationId:
      //   id: `${record.id}-${locationId}`
      //
      // This broke delete/update operations in the UI because the
      // frontend was sending this synthetic id to the
      // `/manufacturing/inventory/:id` endpoint, which expects the
      // real `inventoryItem.id`.
      //
      // To fix this cleanly while keeping backwards compatibility
      // with any UI logic that expects `id` to be location-scoped:
      //   - We keep `id` as the location-scoped identifier
      //   - We *also* expose the real inventory item id via
      //     `inventoryItemId`
      //   - We expose the locationInventory primary key via
      //     `locationInventoryId`
      id: `${record.id}-${locationId}`,
      inventoryItemId: template.id || null,
      locationInventoryId: record.id,
      sku: record.sku,
      name: record.itemName || template.name || record.sku,
      quantity,
      allocatedQuantity: template.allocatedQuantity || 0,
      inProductionQuantity: template.inProductionQuantity || 0,
      completedQuantity: template.completedQuantity || 0,
      unit: template.unit || 'pcs',
      reorderPoint,
      reorderQty: template.reorderQty || 0,
      location: location.name || template.location || '',
      locationId,
      unitCost,
      totalValue: unitCost * quantity,
      supplier: template.supplier || '',
      supplierPartNumbers: template.supplierPartNumbers || '[]',
      manufacturingPartNumber: template.manufacturingPartNumber || '',
      legacyPartNumber: template.legacyPartNumber || '',
      status,
      lastRestocked: record.lastRestocked || template.lastRestocked,
      ownerId: template.ownerId || null
    }
  })
}

/**
 * Build inventory list with one row per SKU (aggregated across all locations).
 * Used when no location filter is applied so the UI shows a single entry per stock item.
 * Includes items that have no LocationInventory yet (templates with 0 stock everywhere).
 */
async function buildAllLocationsInventoryResponse() {
  const locationInventoryRecords = await prisma.locationInventory.findMany({
    include: { location: true },
    orderBy: { itemName: 'asc' }
  })

  // Load all InventoryItem templates (we need metadata for every SKU, including those with no LocationInventory)
  const allTemplates = await prisma.inventoryItem.findMany({
    orderBy: [{ locationId: 'asc' }, { updatedAt: 'desc' }]
  })

  // One template per SKU (prefer row with null locationId, else first by order)
  const templateBySku = new Map()
  for (const meta of allTemplates) {
    if (!templateBySku.has(meta.sku)) {
      templateBySku.set(meta.sku, meta)
    }
  }

  const bySku = new Map()
  for (const record of locationInventoryRecords) {
    const sku = record.sku
    const template = templateBySku.get(sku) || {}
    const quantity = record.quantity ?? 0
    const reorderPoint = record.reorderPoint ?? template.reorderPoint ?? 0
    const unitCost = record.unitCost ?? template.unitCost ?? 0
    const status = record.status || getStatusFromQuantity(quantity, reorderPoint)

    if (!bySku.has(sku)) {
      bySku.set(sku, {
        ...template,
        id: template.id || null,
        inventoryItemId: template.id || null,
        sku,
        name: record.itemName || template.name || record.sku,
        quantity: 0,
        totalValue: 0,
        // Allocation is template-level (InventoryItem); LocationInventory has no allocatedQuantity
        allocatedQuantity: template.allocatedQuantity || 0,
        inProductionQuantity: template.inProductionQuantity || 0,
        completedQuantity: template.completedQuantity || 0,
        unit: template.unit || 'pcs',
        reorderPoint: template.reorderPoint ?? 0,
        reorderQty: template.reorderQty ?? 0,
        location: '',
        locationId: null,
        locations: []
      })
    }
    const row = bySku.get(sku)
    row.quantity += quantity
    row.totalValue += (record.unitCost ?? unitCost) * quantity
    row.locations.push({
      locationId: record.locationId,
      locationName: record.location?.name || '',
      locationCode: record.location?.code || '',
      quantity,
      unitCost: record.unitCost ?? unitCost,
      status
    })
  }

  // Add rows for SKUs that have a template but no LocationInventory (0 stock everywhere)
  for (const [sku, template] of templateBySku) {
    if (!bySku.has(sku)) {
      bySku.set(sku, {
        ...template,
        id: template.id || null,
        inventoryItemId: template.id || null,
        sku,
        name: template.name || sku,
        quantity: 0,
        totalValue: 0,
        allocatedQuantity: template.allocatedQuantity || 0, // template-level only
        inProductionQuantity: template.inProductionQuantity || 0,
        completedQuantity: template.completedQuantity || 0,
        unit: template.unit || 'pcs',
        reorderPoint: template.reorderPoint ?? 0,
        reorderQty: template.reorderQty ?? 0,
        location: '',
        locationId: template.locationId || null,
        locations: []
      })
    }
  }

  const result = Array.from(bySku.values())
  for (const row of result) {
    row.status = getStatusFromQuantity(row.quantity, row.reorderPoint ?? 0)
    if (row.locations.length === 0) row.location = ''
    else if (row.locations.length === 1) row.location = row.locations[0].locationName || row.locations[0].locationCode || ''
    else row.location = 'Multiple locations'
  }
  return result
}

async function syncInventoryAcrossAllLocations(force = false) {
  const now = Date.now()
  if (!force && lastGlobalLocationSync && (now - lastGlobalLocationSync) < GLOBAL_LOCATION_SYNC_INTERVAL_MS) {
    return { skipped: true }
  }

  if (globalSyncPromise) {
    return globalSyncPromise
  }

  globalSyncPromise = (async () => {
    try {
      const locations = await prisma.stockLocation.findMany({
        select: { id: true, code: true, name: true }
      })

      if (!locations.length) {
        lastGlobalLocationSync = Date.now()
        return { syncedLocations: 0, totalCreated: 0 }
      }

      let totalCreated = 0
      for (const location of locations) {
        try {
          const stats = await ensureLocationHasAllInventory(location)
          totalCreated += stats.created
        } catch (error) {
          console.warn(`⚠️ Failed to sync inventory for location ${location.code || location.id}:`, error.message)
        }
      }

      lastGlobalLocationSync = Date.now()
      return { syncedLocations: locations.length, totalCreated }
    } finally {
      globalSyncPromise = null
    }
  })()

  return globalSyncPromise
}

async function handler(req, res) {
  try {
    // Ensure BOM migration is applied (non-blocking, safe)
    ensureBOMMigration().catch(() => {}) // Ignore errors, don't await

    // Sync inventory across locations (non-blocking, don't await to avoid blocking requests)
    syncInventoryAcrossAllLocations().catch((error) => {
      console.warn('⚠️ Global inventory sync skipped:', error.message)
    })
    
    // Strip query parameters and hash from URL path before parsing
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const resourceType = pathSegments[1] // inventory, boms, production-orders, stock-movements, locations, location-inventory, stock-transactions
    const id = pathSegments[2]

    // Helper to parse JSON fields
    const parseJson = (str, defaultValue = []) => {
      try {
        if (!str) return defaultValue
        return typeof str === 'string' ? JSON.parse(str) : str
      } catch {
        return defaultValue
      }
    }

    // Helper to format dates
    const formatDate = (date) => {
      if (!date) return null
      if (date instanceof Date) return date.toISOString().split('T')[0]
      return new Date(date).toISOString().split('T')[0]
    }

    // PURGE ALL MANUFACTURING DATA
    if (req.method === 'DELETE' && resourceType === 'purge') {
      try {
        const { confirm } = req.query
        if (confirm !== 'true') {
          return badRequest(res, 'confirm=true is required to purge manufacturing data')
        }

        const result = await prisma.$transaction(async (tx) => {
          const counts = await Promise.all([
            tx.locationInventory.count(),
            tx.stockMovement.count(),
            tx.productionOrder.count(),
            tx.bOM.count(),
            tx.inventoryItem.count(),
            tx.stockLocation.count(),
            tx.purchaseOrder.count(),
            tx.supplier.count()
          ])

          const deleted = {
            locationInventory: (await tx.locationInventory.deleteMany()).count,
            stockMovements: (await tx.stockMovement.deleteMany()).count,
            productionOrders: (await tx.productionOrder.deleteMany()).count,
            boms: (await tx.bOM.deleteMany()).count,
            inventoryItems: (await tx.inventoryItem.deleteMany()).count,
            stockLocations: (await tx.stockLocation.deleteMany()).count,
            purchaseOrders: (await tx.purchaseOrder.deleteMany()).count,
            suppliers: (await tx.supplier.deleteMany()).count
          }

          return {
            existing: {
              locationInventory: counts[0],
              stockMovements: counts[1],
              productionOrders: counts[2],
              boms: counts[3],
              inventoryItems: counts[4],
              stockLocations: counts[5],
              purchaseOrders: counts[6],
              suppliers: counts[7]
            },
            deleted
          }
        })

        return ok(res, { deleted: true, ...result })
      } catch (error) {
        console.error('❌ Failed to purge manufacturing data:', error)
        return serverError(res, 'Failed to purge manufacturing data', error.message)
      }
    }

  // STOCK LOCATIONS
  if (resourceType === 'locations') {
    // LIST
    if (req.method === 'GET' && !id) {
      try {
        const locations = await prisma.stockLocation.findMany({ orderBy: { createdAt: 'desc' } })
        return ok(res, { locations })
      } catch (e) {
        return serverError(res, 'Failed to list locations', e.message)
      }
    }
    // GET ONE
    if (req.method === 'GET' && id) {
      const loc = await prisma.stockLocation.findUnique({ where: { id } })
      if (!loc) return notFound(res, 'Location not found')
      return ok(res, { location: loc })
    }
    // CREATE
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      if (!body.name) {
        console.error('❌ POST /manufacturing/locations - Missing name in body');
        return badRequest(res, 'name required')
      }
      
      try {
        // auto code
        let code = body.code
        if (!code) {
          const last = await prisma.stockLocation.findFirst({ orderBy: { createdAt: 'desc' } })
          const next = last && last.code?.startsWith('LOC') ? parseInt(last.code.replace('LOC','')) + 1 : 1
          code = `LOC${String(next).padStart(3,'0')}`
        }
        
        // Check for duplicate code
        const existingLocation = await prisma.stockLocation.findUnique({
          where: { code }
        })
        if (existingLocation) {
          console.error(`❌ POST /manufacturing/locations - Duplicate code: ${code}`);
          return badRequest(res, `Location with code ${code} already exists`)
        }
        
        // Parse meta if it's already a string, otherwise stringify it
        let metaValue = body.meta || {};
        if (typeof metaValue === 'string') {
          try {
            metaValue = JSON.parse(metaValue);
          } catch (e) {
            console.warn('⚠️ Could not parse meta as JSON, using as-is:', e.message);
            metaValue = {};
          }
        }
        
        
        const location = await prisma.stockLocation.create({
          data: {
            code,
            name: body.name,
            type: body.type || 'warehouse',
            status: body.status || 'active',
            address: body.address || '',
            contactPerson: body.contactPerson || '',
            contactPhone: body.contactPhone || '',
            meta: JSON.stringify(metaValue)
          }
        })
        
        
        // Ensure every existing inventory item has a placeholder entry for the new location
        try {
          const syncStats = await ensureLocationHasAllInventory(location)
        } catch (invError) {
          console.warn('⚠️ Could not sync inventory for new location:', invError.message)
          // Don't fail location creation if inventory creation fails
        }
        
        // Return the location in the expected format
        const responseData = { location }
        return created(res, responseData)
      } catch (e) {
        console.error('❌ POST /manufacturing/locations - Error:', e);
        console.error('❌ Error code:', e.code);
        console.error('❌ Error message:', e.message);
        console.error('❌ Error stack:', e.stack);
        
        if (e.code === 'P2002') {
          return badRequest(res, `Location with this ${e.meta?.target?.[0] || 'field'} already exists`)
        }
        return serverError(res, 'Failed to create location', e.message)
      }
    }
    // UPDATE
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      try {
        const location = await prisma.stockLocation.update({ where: { id }, data: {
          code: body.code ?? undefined,
          name: body.name ?? undefined,
          type: body.type ?? undefined,
          status: body.status ?? undefined,
          address: body.address ?? undefined,
          contactPerson: body.contactPerson ?? undefined,
          contactPhone: body.contactPhone ?? undefined,
          meta: body.meta !== undefined ? JSON.stringify(body.meta) : undefined
        }})
        return ok(res, { location })
      } catch (e) {
        if (e.code === 'P2025') return notFound(res, 'Location not found')
        return serverError(res, 'Failed to update location', e.message)
      }
    }
    // DELETE
    if (req.method === 'DELETE' && id) {
      try {
        // Only prevent deletion when there is NON-ZERO stock or allocations at this location.
        // Placeholder records with quantity 0 are safe to remove.
        const hasNonZeroLocationInventory = await prisma.locationInventory.findFirst({
          where: {
            locationId: id,
            quantity: { gt: 0 }
          }
        })

        const hasNonZeroInventoryItems = await prisma.inventoryItem.findFirst({
          where: {
            locationId: id,
            OR: [
              { quantity: { gt: 0 } },
              { allocatedQuantity: { gt: 0 } },
              { inProductionQuantity: { gt: 0 } },
              { completedQuantity: { gt: 0 } }
            ]
          }
        })

        if (hasNonZeroLocationInventory || hasNonZeroInventoryItems) {
          return badRequest(
            res,
            'Cannot delete location with non-zero inventory or allocations'
          )
        }

        // Safe to delete – clean up any zero-quantity per-location records and inventory items,
        // then remove the location itself in a single transaction.
        await prisma.$transaction(async (tx) => {
          await tx.locationInventory.deleteMany({ where: { locationId: id } })
          await tx.inventoryItem.deleteMany({ where: { locationId: id } })
          await tx.stockLocation.delete({ where: { id } })
        })

        return ok(res, { deleted: true })
      } catch (e) {
        if (e.code === 'P2025') return notFound(res, 'Location not found')
        return serverError(res, 'Failed to delete location', e.message)
      }
    }
  }

  // LOCATION INVENTORY (per location by SKU)
  if (resourceType === 'location-inventory') {
    // LIST by location: /api/manufacturing/location-inventory/:id (locationId)
    if (req.method === 'GET' && id) {
      try {
        const items = await prisma.locationInventory.findMany({ where: { locationId: id }, orderBy: { updatedAt: 'desc' } })
        return ok(res, { items })
      } catch (e) {
        return serverError(res, 'Failed to list location inventory', e.message)
      }
    }
  }

  // STOCK TRANSACTIONS (receipt, transfer, sale, adjustment with per-location integrity)
  if (resourceType === 'stock-transactions') {
    if (req.method === 'POST') {
      const body = req.body || {}
      const type = String(body.type || '').toLowerCase() // receipt, transfer, sale, adjustment
      if (!['receipt','transfer','sale','adjustment'].includes(type)) return badRequest(res, 'Invalid type')
      if (!body.sku || !body.itemName) return badRequest(res, 'sku and itemName required')
      const qty = parseFloat(body.quantity) || 0
      if (qty <= 0) return badRequest(res, 'quantity must be greater than 0')

      try {
        const result = await prisma.$transaction(async (tx) => {
          // Helper to get or create per-location record
          async function upsertLocationSku(locationId) {
            return await tx.locationInventory.upsert({
              where: { locationId_sku: { locationId, sku: body.sku } },
              update: {
                itemName: body.itemName,
                unitCost: parseFloat(body.unitCost) || 0,
                reorderPoint: parseFloat(body.reorderPoint) || 0
              },
              create: {
                locationId,
                sku: body.sku,
                itemName: body.itemName,
                quantity: 0,
                unitCost: parseFloat(body.unitCost) || 0,
                reorderPoint: parseFloat(body.reorderPoint) || 0,
                status: 'in_stock'
              }
            })
          }

          // Ensure InventoryItem exists
          let master = await tx.inventoryItem.findFirst({ where: { sku: body.sku } })
          if (!master && type !== 'sale' && type !== 'adjustment') {
            // Create with required fields first
            const createData = {
              sku: body.sku,
              name: body.itemName,
              category: body.category || 'components',
              type: body.itemType || 'raw_material',
              quantity: 0,
              unit: body.unit || 'pcs',
              reorderPoint: parseFloat(body.reorderPoint) || 0,
              reorderQty: parseFloat(body.reorderQty) || 0,
              unitCost: parseFloat(body.unitCost) || 0,
              totalValue: 0,
              supplier: body.supplier || ''
            };
            
            // Try to create with new fields, if that fails, create without them
            try {
              master = await tx.inventoryItem.create({ 
                data: {
                  ...createData,
                  supplierPartNumbers: body.supplierPartNumbers || '[]',
                  manufacturingPartNumber: body.manufacturingPartNumber || '',
                  legacyPartNumber: body.legacyPartNumber || '',
                  boxNumber: body.boxNumber || ''
                }
              })
            } catch (createError) {
              // If columns don't exist yet, create without them
              if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('manufacturingPartNumber') || createError.message.includes('legacyPartNumber') || createError.message.includes('boxNumber'))) {
                console.warn('⚠️ Creating inventory item without new fields (columns may not exist yet)');
                master = await tx.inventoryItem.create({ data: createData })
              } else {
                throw createError;
              }
            }
          }

          const now = body.date ? new Date(body.date) : new Date()
          // Generate movement ID
          const last = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
          const seq = last && last.movementId?.startsWith('MOV') ? (parseInt(last.movementId.replace('MOV','')) + 1) : 1
          const movementId = body.movementId || `MOV${String(seq).padStart(4, '0')}`

          // Adjust per type
          if (type === 'receipt') {
            if (!body.toLocationId) return badRequest(res, 'toLocationId required for receipt')
            const toLi = await upsertLocationSku(body.toLocationId)
            const newQtyTo = (toLi.quantity || 0) + qty
            await tx.locationInventory.update({ where: { id: toLi.id }, data: {
              quantity: newQtyTo,
              unitCost: body.unitCost !== undefined ? parseFloat(body.unitCost) : toLi.unitCost,
              lastRestocked: now,
              status: newQtyTo > toLi.reorderPoint ? 'in_stock' : (newQtyTo > 0 ? 'low_stock' : 'out_of_stock')
            }})
            // Update master aggregate
            const totalAtLocations = await tx.locationInventory.aggregate({ _sum: { quantity: true }, where: { sku: body.sku } })
            const aggQty = totalAtLocations._sum.quantity || 0
            if (master) {
              await tx.inventoryItem.update({ where: { id: master.id }, data: {
                quantity: aggQty,
                unitCost: body.unitCost !== undefined ? parseFloat(body.unitCost) : master.unitCost,
                totalValue: aggQty * (body.unitCost !== undefined ? parseFloat(body.unitCost) : (master.unitCost || 0)),
                lastRestocked: now,
                status: aggQty > (master.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
              }})
            }
          }

          if (type === 'transfer') {
            if (!body.fromLocationId || !body.toLocationId) return badRequest(res, 'fromLocationId and toLocationId required for transfer')
            const fromLi = await upsertLocationSku(body.fromLocationId)
            if ((fromLi.quantity || 0) < qty) throw new Error('Insufficient stock at source location')
            const toLi = await upsertLocationSku(body.toLocationId)
            await tx.locationInventory.update({ where: { id: fromLi.id }, data: {
              quantity: fromLi.quantity - qty,
              status: (fromLi.quantity - qty) > fromLi.reorderPoint ? 'in_stock' : ((fromLi.quantity - qty) > 0 ? 'low_stock' : 'out_of_stock')
            }})
            await tx.locationInventory.update({ where: { id: toLi.id }, data: {
              quantity: toLi.quantity + qty,
              status: (toLi.quantity + qty) > toLi.reorderPoint ? 'in_stock' : ((toLi.quantity + qty) > 0 ? 'low_stock' : 'out_of_stock')
            }})
            // Master aggregate unaffected in total (sum constant), but recalc for safety
            const totalAtLocations = await tx.locationInventory.aggregate({ _sum: { quantity: true }, where: { sku: body.sku } })
            const aggQty = totalAtLocations._sum.quantity || 0
            if (master) {
              await tx.inventoryItem.update({ where: { id: master.id }, data: {
                quantity: aggQty,
                totalValue: aggQty * (master.unitCost || 0),
                status: aggQty > (master.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
              }})
            }
          }

          if (type === 'sale' || type === 'adjustment') {
            // For adjustments, default to item's location or main warehouse if not specified
            let locationId = body.fromLocationId || body.locationId
            if (!locationId && type === 'adjustment' && master) {
              locationId = master.locationId
            }
            if (!locationId && type === 'adjustment') {
              // Default to main warehouse for adjustments if no location specified
              const mainWarehouse = await tx.stockLocation.findFirst({ 
                where: { code: 'LOC001' } 
              })
              if (mainWarehouse) {
                locationId = mainWarehouse.id
              }
            }
            if (!locationId) return badRequest(res, 'locationId required for sale/adjustment')
            const fromLi = await upsertLocationSku(locationId)
            // For adjustments, use quantity directly (can be positive or negative)
            // For sales, always make it negative
            const delta = type === 'sale' ? -qty : (parseFloat(body.delta) !== undefined ? parseFloat(body.delta) : qty)
            const newQty = (fromLi.quantity || 0) + delta
            if (newQty < 0 && type === 'sale') throw new Error('Resulting quantity cannot be negative')
            // Allow negative for adjustments (user corrections)
            await tx.locationInventory.update({ where: { id: fromLi.id }, data: {
              quantity: newQty,
              status: newQty > fromLi.reorderPoint ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')
            }})
            // Update master
            const totalAtLocations = await tx.locationInventory.aggregate({ _sum: { quantity: true }, where: { sku: body.sku } })
            const aggQty = totalAtLocations._sum.quantity || 0
            if (master) {
              await tx.inventoryItem.update({ where: { id: master.id }, data: {
                quantity: aggQty,
                totalValue: aggQty * (master.unitCost || 0),
                status: aggQty > (master.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
              }})
            }
          }

          // Create stock movement record
          const movement = await tx.stockMovement.create({ data: {
            movementId,
            date: now,
            type: type === 'sale' ? 'consumption' : (type === 'adjustment' ? 'adjustment' : type),
            itemName: body.itemName,
            sku: body.sku,
            quantity: qty,
            fromLocation: body.fromLocationId || body.locationId || '',
            toLocation: body.toLocationId || '',
            reference: body.reference || '',
            performedBy: body.performedBy || req.user?.name || 'System',
            notes: body.notes || ''
          }})

          return { movement }
        })

        return created(res, { movement: {
          ...result.movement,
          date: formatDate(result.movement.date),
          createdAt: formatDate(result.movement.createdAt),
          updatedAt: formatDate(result.movement.updatedAt)
        } })
      } catch (e) {
        const msg = e?.message || 'Failed to process stock transaction'
        console.error('❌ Stock transaction error:', e)
        return serverError(res, msg, msg)
      }
    }
  }

  // INVENTORY ITEMS
  if (resourceType === 'inventory') {
    // LIST (GET /api/manufacturing/inventory)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        
        // Parse query parameters from URL - use safe parsing method
        let locationId = null
        try {
          // Try req.query first (if available from framework)
          locationId = req.query?.locationId || req.query?.location
          
          // If not in req.query, parse from URL manually
          if (!locationId && req.url) {
            const queryString = req.url.split('?')[1]
            if (queryString) {
              const params = new URLSearchParams(queryString)
              locationId = params.get('locationId') || params.get('location')
            }
          }
        } catch (parseError) {
          console.warn('⚠️ Failed to parse query parameters:', parseError.message)
          // Continue with locationId = null (will show all locations)
        }
        
        const locationFilterActive = locationId && locationId !== 'all' && locationId !== ''
        let items = []

        if (locationFilterActive) {
          items = await buildLocationInventoryResponse(locationId)
        } else {
          // One row per SKU (aggregated across locations); no per-location duplicate rows
          items = await buildAllLocationsInventoryResponse()
        }

        // Format dates for response
        const formatted = items.map(item => ({
          ...item,
          lastRestocked: formatDate(item.lastRestocked),
          createdAt: formatDate(item.createdAt),
          updatedAt: formatDate(item.updatedAt)
        }))
        
        return ok(res, { inventory: formatted })
      } catch (error) {
        console.error('❌ Failed to list inventory:', error)
        return serverError(res, 'Failed to list inventory', error.message)
      }
    }

    // GET ONE (GET /api/manufacturing/inventory/:id)
    if (req.method === 'GET' && id) {
      try {
        const item = await prisma.inventoryItem.findUnique({
          where: { id }
        })
        
        if (!item) {
          return notFound(res, 'Inventory item not found')
        }
        
        return ok(res, { 
          item: {
            ...item,
            lastRestocked: formatDate(item.lastRestocked),
            createdAt: formatDate(item.createdAt),
            updatedAt: formatDate(item.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get inventory item:', error)
        return serverError(res, 'Failed to get inventory item', error.message)
      }
    }

    // BULK IMPORT (POST /api/manufacturing/inventory with items array)
    if (req.method === 'POST' && !id && Array.isArray(req.body?.items)) {
      const items = req.body.items || []
      
      if (items.length === 0) {
        return badRequest(res, 'items array required and must not be empty')
      }


      try {
        // Get current max SKU number
        const allItems = await prisma.inventoryItem.findMany({
          where: { sku: { startsWith: 'SKU' } },
          select: { sku: true }
        })
        
        let maxNumber = 0
        for (const item of allItems) {
          const match = item.sku.match(/^SKU(\d+)$/)
          if (match) {
            const num = parseInt(match[1])
            if (num > maxNumber) maxNumber = num
          }
        }

        let nextSkuNumber = maxNumber + 1
        const created = []
        const errors = []

        // Helper functions
        const determineCategory = (partNumber, description) => {
          const partLower = (partNumber || '').toLowerCase()
          const descLower = (description || '').toLowerCase()
          
          if (partLower.includes('fuse') || partLower.includes('led') || partLower.includes('diode') || 
              partLower.includes('transistor') || partLower.includes('capacitor') || partLower.includes('resistor') ||
              partLower.includes('ic') || partLower.includes('op amp') || partLower.includes('regulator') ||
              partLower.includes('sensor') || partLower.includes('switch') || partLower.includes('connector') ||
              partLower.includes('header') || partLower.includes('socket') || partLower.includes('relay') ||
              partLower.includes('inductor') || partLower.includes('zener') || partLower.includes('schottky')) {
            return 'components'
          }
          
          if (partLower.includes('enclosure') || partLower.includes('box') || partLower.includes('housing') ||
              partLower.includes('panel') || partLower.includes('gland') || partLower.includes('junction')) {
            return 'accessories'
          }
          
          if (partLower.includes('battery') || partLower.includes('power') || partLower.includes('psu')) {
            return 'accessories'
          }
          
          if (partLower.includes('screw') || partLower.includes('nut') || partLower.includes('washer') ||
              partLower.includes('spacer') || partLower.includes('tape') || partLower.includes('pipe') ||
              partLower.includes('joiner') || partLower.includes('valve')) {
            return 'accessories'
          }
          
          if (partLower.includes('completed unit') || partLower.includes('fuel track completed')) {
            return 'finished_goods'
          }
          
          return 'components'
        }

        const determineType = (partNumber, description) => {
          const partLower = (partNumber || '').toLowerCase()
          
          if (partLower.includes('completed unit') || partLower.includes('finished')) {
            return 'final_product'
          }
          
          return 'component'
        }

        // Process items in batch
        for (const itemData of items) {
          try {
            const name = itemData.name || itemData.description || itemData.partNumber
            if (!name) {
              errors.push({ item: itemData.partNumber || 'Unknown', error: 'name/description required' })
              continue
            }

            const quantity = parseFloat(itemData.quantity) || 0
            const totalValue = parseFloat(itemData.totalValue) || 0
            const unitCost = quantity > 0 ? Math.round((totalValue / quantity) * 100) / 100 : 0
            const reorderPoint = Math.max(1, Math.floor(quantity * 0.2))
            const reorderQty = Math.max(10, Math.floor(quantity * 0.3))
            
            let status = 'out_of_stock'
            if (quantity > reorderPoint) {
              status = 'in_stock'
            } else if (quantity > 0 && quantity <= reorderPoint) {
              status = 'low_stock'
            }

            const sku = `SKU${String(nextSkuNumber).padStart(4, '0')}`
            nextSkuNumber++

            // Create with core fields first
            const createData = {
              sku,
              name,
              thumbnail: itemData.thumbnail || '',
              category: itemData.category || determineCategory(itemData.partNumber, itemData.description),
              type: itemData.type || determineType(itemData.partNumber, itemData.description),
              quantity,
              unit: itemData.unit || 'pcs',
              reorderPoint,
              reorderQty,
              location: itemData.location || '',
              unitCost,
              totalValue,
              supplier: itemData.supplier || '',
              status,
              lastRestocked: new Date(),
              ownerId: null
            };
            
            // Get locationId - resolve from locationCode if provided, else default to main warehouse
            let locationId = itemData.locationId || null
            if (!locationId && itemData.locationCode) {
              const byCode = await prisma.stockLocation.findFirst({
                where: { code: String(itemData.locationCode).trim() }
              })
              if (byCode) locationId = byCode.id
            }
            if (!locationId) {
              const mainWarehouse = await prisma.stockLocation.findFirst({
                where: { code: 'LOC001' }
              })
              if (mainWarehouse) {
                locationId = mainWarehouse.id
              }
            }
            
            // Add locationId to createData
            createData.locationId = locationId

            // Try to create with new fields, fallback to core fields if columns don't exist
            let inventoryItem;
            try {
              inventoryItem = await prisma.inventoryItem.create({
                data: {
                  ...createData,
                  supplierPartNumbers: itemData.supplierPartNumbers || '[]',
                  manufacturingPartNumber: itemData.manufacturingPartNumber || '',
                  legacyPartNumber: itemData.legacyPartNumber || '',
                  boxNumber: itemData.boxNumber || ''
                }
              })
            } catch (createError) {
              if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('manufacturingPartNumber') || createError.message.includes('legacyPartNumber') || createError.message.includes('boxNumber'))) {
                console.warn('⚠️ Bulk import: Creating items without new fields (run migration)');
                inventoryItem = await prisma.inventoryItem.create({ data: createData })
              } else {
                throw createError;
              }
            }

            // Create LocationInventory placeholder for this item's location only
            // Best practice: Items are location-specific, not duplicated across all locations
            if (locationId && quantity > 0) {
              await ensureLocationInventoryPlaceholder(locationId, inventoryItem)
              // Update the LocationInventory with the initial quantity
              await upsertLocationInventoryQuantity(locationId, inventoryItem, quantity)
            }
            
            // Create stock movement for starting balance (best practice: record all inventory changes)
            // Always create movement if quantity > 0, even if no location (for audit trail)
            if (quantity > 0) {
              try {
                const lastMovement = await prisma.stockMovement.findFirst({
                  orderBy: { createdAt: 'desc' }
                })
                const nextNumber = lastMovement && lastMovement.movementId?.startsWith('MOV')
                  ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                  : 1
                
                let locationCode = ''
                if (locationId) {
                  const location = await prisma.stockLocation.findUnique({ where: { id: locationId } })
                  locationCode = location?.code || ''
                }
                
                await prisma.stockMovement.create({
                  data: {
                    movementId: `MOV${String(nextNumber).padStart(4, '0')}`,
                    date: new Date(),
                    type: 'adjustment', // Starting balance is an adjustment
                    itemName: inventoryItem.name,
                    sku: inventoryItem.sku,
                    quantity: quantity, // Positive for starting balance
                    fromLocation: '',
                    toLocation: locationCode,
                    reference: 'BULK_IMPORT',
                    performedBy: 'System',
                    notes: locationCode 
                      ? `Initial stock balance recorded for ${inventoryItem.name} at ${locationCode} (bulk import)`
                      : `Initial stock balance recorded for ${inventoryItem.name} (bulk import, no location assigned)`,
                    ownerId: null
                  }
                })
              } catch (movementError) {
                // Log but don't fail the bulk import if movement creation fails
                console.error(`❌ Failed to create stock movement for ${inventoryItem.sku}:`, movementError.message)
                console.error('❌ Error stack:', movementError.stack)
              }
            }
            
            created.push({ sku: inventoryItem.sku, name: inventoryItem.name })
          } catch (error) {
            errors.push({ 
              item: itemData.partNumber || itemData.name || 'Unknown', 
              error: error.message 
            })
          }
        }

        return ok(res, {
          message: `Bulk import completed: ${created.length} items created, ${errors.length} errors`,
          created: created.length,
          errors: errors.length,
          createdItems: created,
          errorItems: errors
        })
      } catch (error) {
        console.error('❌ Bulk import failed:', error)
        return serverError(res, 'Failed to bulk import inventory items', error.message)
      }
    }

    // CREATE (POST /api/manufacturing/inventory)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      if (!body.name) {
        return badRequest(res, 'name required')
      }

      try {
        // Generate sequential SKU (SKU0001, SKU0002, etc.)
        // Find all items with SKU prefix and extract the highest number
        const allItems = await prisma.inventoryItem.findMany({
          where: {
            sku: { startsWith: 'SKU' }
          },
          select: { sku: true }
        })
        
        let maxNumber = 0
        for (const item of allItems) {
          const match = item.sku.match(/^SKU(\d+)$/)
          if (match) {
            const num = parseInt(match[1])
            if (num > maxNumber) {
              maxNumber = num
            }
          }
        }
        
        const nextSkuNumber = maxNumber + 1
        const sku = `SKU${String(nextSkuNumber).padStart(4, '0')}`

        // Defensive cleanup: if a previously deleted SKU reused the same number,
        // remove any orphaned per-location rows before creating the new item.
        await prisma.locationInventory.deleteMany({ where: { sku } })
        await prisma.inventoryItem.deleteMany({ where: { sku } })
        
        // Calculate status based on quantity and reorder point
        const quantity = parseFloat(body.quantity) || 0
        const reorderPoint = parseFloat(body.reorderPoint) || 0
        let status = 'out_of_stock'
        if (quantity > reorderPoint) {
          status = 'in_stock'
        } else if (quantity > 0 && quantity <= reorderPoint) {
          status = 'low_stock'
        }
        
        const totalValue = quantity * (parseFloat(body.unitCost) || 0)
        const lastRestocked = body.lastRestocked ? new Date(body.lastRestocked) : new Date()
        
        // Get locationId - if not provided, default to main warehouse
        let locationId = body.locationId || null
        if (!locationId) {
          const mainWarehouse = await prisma.stockLocation.findFirst({ 
            where: { code: 'LOC001' } 
          })
          if (mainWarehouse) {
            locationId = mainWarehouse.id
          }
        }
        
        const item = await prisma.inventoryItem.create({
          data: {
            sku: sku,
            name: body.name,
            thumbnail: body.thumbnail || '',
            category: body.category || 'components',
            type: body.type || 'component',
            quantity: quantity,
            inProductionQuantity: parseFloat(body.inProductionQuantity) || 0,
            completedQuantity: parseFloat(body.completedQuantity) || 0,
            unit: body.unit || 'pcs',
            reorderPoint: reorderPoint,
            reorderQty: parseFloat(body.reorderQty) || 0,
            location: body.location || '',
            locationId: locationId, // Link to stock location
            unitCost: parseFloat(body.unitCost) || 0,
            totalValue,
            supplier: body.supplier || '',
            status: status,
            lastRestocked,
            ownerId: null
          }
        })
        
        // Try to update new fields if provided (safe - won't crash if columns don't exist yet)
        if ((body.supplierPartNumbers !== undefined || body.manufacturingPartNumber !== undefined || body.legacyPartNumber !== undefined || body.boxNumber !== undefined)) {
          try {
            const updateFields = {};
            if (body.supplierPartNumbers !== undefined) updateFields.supplierPartNumbers = body.supplierPartNumbers || '[]';
            if (body.manufacturingPartNumber !== undefined) updateFields.manufacturingPartNumber = body.manufacturingPartNumber || '';
            if (body.legacyPartNumber !== undefined) updateFields.legacyPartNumber = body.legacyPartNumber || '';
            if (body.boxNumber !== undefined) updateFields.boxNumber = body.boxNumber || '';
            
            if (Object.keys(updateFields).length > 0) {
              await prisma.inventoryItem.update({
                where: { id: item.id },
                data: updateFields
              });
              // Update local item object for response
              Object.assign(item, updateFields);
            }
          } catch (e) {
            // Columns may not exist yet - this is safe, migration will add them
            console.warn('⚠️ New inventory fields not available yet (run migration):', e.message);
          }
        }
        
        // Create LocationInventory placeholder for this item's location only
        // Best practice: Items are location-specific, not duplicated across all locations
        if (locationId && quantity > 0) {
          await ensureLocationInventoryPlaceholder(locationId, item)
          // Update the LocationInventory with the initial quantity
          await upsertLocationInventoryQuantity(locationId, item, quantity)
        }
        
        // Create stock movement for starting balance (best practice: record all inventory changes)
        // Always create movement if quantity > 0, even if no location (for audit trail)
        if (quantity > 0) {
          try {
            const lastMovement = await prisma.stockMovement.findFirst({
              orderBy: { createdAt: 'desc' }
            })
            const nextNumber = lastMovement && lastMovement.movementId?.startsWith('MOV')
              ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
              : 1
            
            let locationCode = ''
            if (locationId) {
              const location = await prisma.stockLocation.findUnique({ where: { id: locationId } })
              locationCode = location?.code || ''
            }
            
            await prisma.stockMovement.create({
              data: {
                movementId: `MOV${String(nextNumber).padStart(4, '0')}`,
                date: new Date(),
                type: 'adjustment', // Starting balance is an adjustment
                itemName: item.name,
                sku: item.sku,
                quantity: quantity, // Positive for starting balance
                fromLocation: '',
                toLocation: locationCode,
                reference: 'INITIAL_BALANCE',
                performedBy: req.user?.name || 'System',
                notes: locationCode 
                  ? `Initial stock balance recorded for ${item.name} at ${locationCode}`
                  : `Initial stock balance recorded for ${item.name} (no location assigned)`,
                ownerId: null
              }
            })
          } catch (movementError) {
            // Log but don't fail the inventory creation if movement creation fails
            console.error('❌ Failed to create stock movement for initial balance:', movementError.message)
            console.error('❌ Error stack:', movementError.stack)
          }
        }
        
        return created(res, { 
          item: {
            ...item,
            lastRestocked: formatDate(item.lastRestocked),
            createdAt: formatDate(item.createdAt),
            updatedAt: formatDate(item.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create inventory item:', error)
        return serverError(res, 'Failed to create inventory item', error.message)
      }
    }

    // UPDATE (PATCH /api/manufacturing/inventory/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        const existing = await prisma.inventoryItem.findUnique({ where: { id } })
        if (!existing) {
          return notFound(res, 'Inventory item not found')
        }
        
        const updateData = {}
        
        // SKU cannot be changed (read-only after creation)
        // if (body.sku !== undefined) updateData.sku = body.sku
        if (body.name !== undefined) updateData.name = body.name
        if (body.thumbnail !== undefined) updateData.thumbnail = body.thumbnail
        if (body.category !== undefined) updateData.category = body.category
        if (body.type !== undefined) updateData.type = body.type
        if (body.inProductionQuantity !== undefined) updateData.inProductionQuantity = parseFloat(body.inProductionQuantity) || 0
        if (body.completedQuantity !== undefined) updateData.completedQuantity = parseFloat(body.completedQuantity) || 0
        // Quantity cannot be edited (only through stock movements)
        // if (body.quantity !== undefined) updateData.quantity = parseFloat(body.quantity)
        if (body.unit !== undefined) updateData.unit = body.unit
        if (body.reorderPoint !== undefined) updateData.reorderPoint = parseFloat(body.reorderPoint)
        if (body.reorderQty !== undefined) updateData.reorderQty = parseFloat(body.reorderQty)
        // Location removed - don't update it
        if (body.unitCost !== undefined) updateData.unitCost = parseFloat(body.unitCost)
        if (body.supplier !== undefined) updateData.supplier = body.supplier
        
        // New fields - only include if provided (safe for backwards compatibility)
        if (body.supplierPartNumbers !== undefined) {
          try {
            updateData.supplierPartNumbers = body.supplierPartNumbers
          } catch (e) {
            // Column may not exist yet - safe to ignore
            console.warn('⚠️ supplierPartNumbers field not available:', e.message)
          }
        }
        if (body.manufacturingPartNumber !== undefined) {
          try {
            updateData.manufacturingPartNumber = body.manufacturingPartNumber
          } catch (e) {
            // Column may not exist yet - safe to ignore
            console.warn('⚠️ manufacturingPartNumber field not available:', e.message)
          }
        }
        if (body.legacyPartNumber !== undefined) {
          try {
            updateData.legacyPartNumber = body.legacyPartNumber
          } catch (e) {
            // Column may not exist yet - safe to ignore
            console.warn('⚠️ legacyPartNumber field not available:', e.message)
          }
        }
        if (body.boxNumber !== undefined) {
          try {
            updateData.boxNumber = body.boxNumber || ''
          } catch (e) {
            console.warn('⚠️ boxNumber field not available:', e.message)
          }
        }
        
        // Status will be auto-calculated based on quantity and reorder point
        if (body.lastRestocked !== undefined) updateData.lastRestocked = body.lastRestocked ? new Date(body.lastRestocked) : null
        
        // Recalculate totalValue if unitCost changed (quantity won't change as it's read-only)
        if (body.unitCost !== undefined) {
          const qty = existing.quantity
          const cost = parseFloat(body.unitCost)
          updateData.totalValue = qty * cost
        }
        
        // Auto-calculate status based on quantity and reorder point
        // Use existing quantity (it can't be changed via update)
        const quantity = existing.quantity
        const reorderPoint = body.reorderPoint !== undefined ? parseFloat(body.reorderPoint) : existing.reorderPoint
        if (quantity > reorderPoint) {
          updateData.status = 'in_stock'
        } else if (quantity > 0 && quantity <= reorderPoint) {
          updateData.status = 'low_stock'
        } else {
          updateData.status = 'out_of_stock'
        }
        
        // Try to update - if new fields cause error, retry without them
        let item;
        try {
          item = await prisma.inventoryItem.update({
            where: { id },
            data: updateData
          })
        } catch (updateError) {
          // If error is about missing columns, retry without new fields
          if (updateError.message && (updateError.message.includes('supplierPartNumbers') || updateError.message.includes('manufacturingPartNumber') || updateError.message.includes('legacyPartNumber') || updateError.message.includes('boxNumber'))) {
            console.warn('⚠️ New inventory columns not available yet, updating without them');
            const safeUpdateData = { ...updateData };
            delete safeUpdateData.supplierPartNumbers;
            delete safeUpdateData.manufacturingPartNumber;
            delete safeUpdateData.legacyPartNumber;
            delete safeUpdateData.boxNumber;
            item = await prisma.inventoryItem.update({
              where: { id },
              data: safeUpdateData
            })
          } else {
            throw updateError;
          }
        }
        
        return ok(res, { 
          item: {
            ...item,
            lastRestocked: formatDate(item.lastRestocked),
            createdAt: formatDate(item.createdAt),
            updatedAt: formatDate(item.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to update inventory item:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Inventory item not found')
        }
        return serverError(res, 'Failed to update inventory item', error.message)
      }
    }

    // DELETE (DELETE /api/manufacturing/inventory/:id)
    if (req.method === 'DELETE' && id) {
      try {
        const userRole = (req.user?.role || '').toLowerCase()
        if (userRole !== 'admin') {
          return forbidden(res, 'Only admins can delete inventory items.')
        }

        const itemToDelete = await prisma.inventoryItem.findUnique({ where: { id } })
        if (!itemToDelete) {
          return notFound(res, 'Inventory item not found')
        }

        // IMPORTANT SAFETY CHECK:
        // Don't allow deleting an inventory item that is linked to one or more BOMs
        // as the finished product. Prisma will also enforce this via FK constraints,
        // but this gives the user a clear, friendly error message instead of a
        // generic server error.
        const linkedBomCount = await prisma.bOM.count({
          where: { inventoryItemId: id }
        })

        if (linkedBomCount > 0) {
          return badRequest(
            res,
            `Cannot delete this item because it is linked to ${linkedBomCount} Bill(s) of Materials. ` +
            'Please remove or reassign those BOMs before deleting the item.'
          )
        }

        await prisma.$transaction(async (tx) => {
          // Remove per-location aggregates so they cannot drift
          await tx.locationInventory.deleteMany({ where: { sku: itemToDelete.sku } })
          // Remove all clones for this SKU across locations
          await tx.inventoryItem.deleteMany({ where: { sku: itemToDelete.sku } })
        })
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete inventory item:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Inventory item not found')
        }
        return serverError(res, 'Failed to delete inventory item', error.message)
      }
    }
  }

  // BILL OF MATERIALS (BOMs)
  if (resourceType === 'boms') {
    // LIST (GET /api/manufacturing/boms)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        
        // Verify BOM table exists first
        try {
          const boms = await prisma.bOM.findMany({
            orderBy: { createdAt: 'desc' }
          })
          
          const formatted = boms.map(bom => ({
            ...bom,
            id: bom.id,
            components: parseJson(bom.components),
            effectiveDate: formatDate(bom.effectiveDate),
            createdAt: formatDate(bom.createdAt),
            updatedAt: formatDate(bom.updatedAt)
          }))
          
          return ok(res, { boms: formatted })
        } catch (queryError) {
          // If table doesn't exist, check if it's a migration issue
          if (queryError.code === 'P2021' || queryError.message?.includes('does not exist')) {
            console.error('❌ BOM table does not exist. Run migrations:', queryError.message)
            return serverError(res, 'BOM table not found. Please run database migrations.', 'P2021')
          }
          throw queryError
        }
      } catch (error) {
        console.error('❌ Failed to list BOMs:', {
          message: error.message,
          code: error.code,
          name: error.name,
          meta: error.meta
        })
        return serverError(res, 'Failed to list BOMs', error.message || 'Unknown database error')
      }
    }

    // GET ONE (GET /api/manufacturing/boms/:id)
    if (req.method === 'GET' && id) {
      try {
        const bom = await prisma.bOM.findUnique({
          where: { id }
        })
        
        if (!bom) {
          return notFound(res, 'BOM not found')
        }
        
        return ok(res, { 
          bom: {
            ...bom,
            components: parseJson(bom.components),
            effectiveDate: formatDate(bom.effectiveDate),
            createdAt: formatDate(bom.createdAt),
            updatedAt: formatDate(bom.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get BOM:', error)
        return serverError(res, 'Failed to get BOM', error.message)
      }
    }

    // CREATE (POST /api/manufacturing/boms)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      if (!body.productSku || !body.productName) {
        return badRequest(res, 'productSku and productName required')
      }
      
      // REQUIRE inventoryItemId - BOM must be linked to an inventory item
      if (!body.inventoryItemId) {
        return badRequest(res, 'inventoryItemId is required. Please create the finished product inventory item first, then select it when creating the BOM.')
      }

      try {
        // Validate that the inventory item exists
        const inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: body.inventoryItemId }
        })
        
        if (!inventoryItem) {
          return badRequest(res, 'Inventory item not found. Please create the finished product inventory item first.')
        }
        
        // Verify that the productSku matches the inventory item's SKU
        if (inventoryItem.sku !== body.productSku) {
          return badRequest(res, `Product SKU (${body.productSku}) must match the selected inventory item SKU (${inventoryItem.sku})`)
        }
        
        const components = Array.isArray(body.components) ? body.components : parseJson(body.components, [])
        const totalMaterialCost = components.reduce((sum, comp) => sum + (parseFloat(comp.totalCost) || 0), 0)
        const laborCost = parseFloat(body.laborCost) || 0
        const overheadCost = parseFloat(body.overheadCost) || 0
        const totalCost = totalMaterialCost + laborCost + overheadCost
        
        // Create BOM
        const bom = await prisma.bOM.create({
          data: {
            productSku: body.productSku,
            productName: body.productName,
            inventoryItemId: body.inventoryItemId,
            version: body.version || '1.0',
            status: body.status || 'active',
            effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : new Date(),
            laborCost,
            overheadCost,
            totalMaterialCost,
            totalCost,
            estimatedTime: parseInt(body.estimatedTime) || 0,
            components: JSON.stringify(components),
            notes: body.notes || '',
            thumbnail: body.thumbnail || '',
            instructions: body.instructions || '',
            ownerId: null
          }
        })
        
        return created(res, { 
          bom: {
            ...bom,
            components: parseJson(bom.components),
            effectiveDate: formatDate(bom.effectiveDate),
            createdAt: formatDate(bom.createdAt),
            updatedAt: formatDate(bom.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create BOM:', {
          error: error.message,
          code: error.code,
          name: error.name,
          stack: error.stack?.substring(0, 500),
          productSku: body.productSku,
          inventoryItemId: body.inventoryItemId,
          meta: error.meta
        })
        
        // Handle specific Prisma errors
        if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008') {
          return serverError(res, 'Database connection error. Please try again.', 'DATABASE_CONNECTION_ERROR')
        }
        
        if (error.code === 'P2002') {
          const field = error.meta?.target?.[0] || 'field'
          return badRequest(res, `A BOM with this ${field} already exists.`)
        }
        
        if (error.code === 'P2025') {
          return badRequest(res, 'Referenced inventory item not found.')
        }
        
        // Generic error response
        return serverError(res, 'Failed to create BOM', error.message)
      }
    }

    // UPDATE (PATCH /api/manufacturing/boms/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        const updateData = {}
        
        if (body.productSku !== undefined) updateData.productSku = body.productSku
        if (body.productName !== undefined) updateData.productName = body.productName
        if (body.inventoryItemId !== undefined) {
          // Validate inventory item exists if being updated
          if (body.inventoryItemId) {
            const inventoryItem = await prisma.inventoryItem.findUnique({
              where: { id: body.inventoryItemId }
            })
            if (!inventoryItem) {
              return badRequest(res, 'Inventory item not found')
            }
            // Verify SKU matches if productSku is also being updated
            if (body.productSku && inventoryItem.sku !== body.productSku) {
              return badRequest(res, `Product SKU must match the selected inventory item SKU (${inventoryItem.sku})`)
            }
          }
          updateData.inventoryItemId = body.inventoryItemId || null
        }
        if (body.version !== undefined) updateData.version = body.version
        if (body.status !== undefined) updateData.status = body.status
        if (body.effectiveDate !== undefined) updateData.effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null
        if (body.laborCost !== undefined) updateData.laborCost = parseFloat(body.laborCost)
        if (body.overheadCost !== undefined) updateData.overheadCost = parseFloat(body.overheadCost)
        if (body.estimatedTime !== undefined) updateData.estimatedTime = parseInt(body.estimatedTime)
        if (body.notes !== undefined) updateData.notes = body.notes
        if (body.thumbnail !== undefined) updateData.thumbnail = body.thumbnail || ''
        if (body.instructions !== undefined) updateData.instructions = body.instructions || ''
        
        // Recalculate costs if components or cost fields changed
        if (body.components !== undefined || body.laborCost !== undefined || body.overheadCost !== undefined) {
          const existing = await prisma.bOM.findUnique({ where: { id } })
          const components = body.components !== undefined 
            ? (Array.isArray(body.components) ? body.components : parseJson(body.components, []))
            : parseJson(existing.components, [])
          const totalMaterialCost = components.reduce((sum, comp) => sum + (parseFloat(comp.totalCost) || 0), 0)
          const laborCost = body.laborCost !== undefined ? parseFloat(body.laborCost) : existing.laborCost
          const overheadCost = body.overheadCost !== undefined ? parseFloat(body.overheadCost) : existing.overheadCost
          
          updateData.components = JSON.stringify(components)
          updateData.totalMaterialCost = totalMaterialCost
          updateData.totalCost = totalMaterialCost + laborCost + overheadCost
        }
        
        const bom = await prisma.bOM.update({
          where: { id },
          data: updateData
        })
        
        return ok(res, { 
          bom: {
            ...bom,
            components: parseJson(bom.components),
            effectiveDate: formatDate(bom.effectiveDate),
            createdAt: formatDate(bom.createdAt),
            updatedAt: formatDate(bom.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to update BOM:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'BOM not found')
        }
        return serverError(res, 'Failed to update BOM', error.message)
      }
    }

    // DELETE (DELETE /api/manufacturing/boms/:id)
    if (req.method === 'DELETE' && id) {
      try {
        await prisma.bOM.delete({ where: { id } })
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete BOM:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'BOM not found')
        }
        return serverError(res, 'Failed to delete BOM', error.message)
      }
    }
  }

  // PRODUCTION ORDERS
  if (resourceType === 'production-orders') {
    // LIST (GET /api/manufacturing/production-orders)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        const orders = await prisma.productionOrder.findMany({
          orderBy: { createdAt: 'desc' }
        })
        
        const formatted = orders.map(order => ({
          ...order,
          startDate: formatDate(order.startDate),
          targetDate: formatDate(order.targetDate),
          completedDate: formatDate(order.completedDate),
          createdAt: formatDate(order.createdAt),
          updatedAt: formatDate(order.updatedAt)
        }))
        
        return ok(res, { productionOrders: formatted })
      } catch (error) {
        console.error('❌ Failed to list production orders:', error)
        return serverError(res, 'Failed to list production orders', error.message)
      }
    }

    // GET ONE (GET /api/manufacturing/production-orders/:id)
    if (req.method === 'GET' && id) {
      try {
        const order = await prisma.productionOrder.findUnique({
          where: { id }
        })
        
        if (!order) {
          return notFound(res, 'Production order not found')
        }
        
        return ok(res, { 
          order: {
            ...order,
            startDate: formatDate(order.startDate),
            targetDate: formatDate(order.targetDate),
            completedDate: formatDate(order.completedDate),
            createdAt: formatDate(order.createdAt),
            updatedAt: formatDate(order.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get production order:', error)
        return serverError(res, 'Failed to get production order', error.message)
      }
    }

    // CREATE (POST /api/manufacturing/production-orders)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      if (!body.productSku || !body.productName || body.quantity === undefined || body.quantity === null || parseInt(body.quantity) <= 0) {
        return badRequest(res, 'productSku, productName, and quantity (must be > 0) required')
      }

      try {
        const orderQuantity = parseInt(body.quantity) || 0
        const orderStatus = body.status || 'requested'
        
        // Allocate stock if BOM is provided and status is 'requested'
        // WRAPPED IN TRANSACTION to ensure atomicity (allocation + order creation)
        
        const order = await prisma.$transaction(async (tx) => {
          // First, allocate stock if needed
          if (body.bomId && orderStatus === 'requested') {
            const bom = await tx.bOM.findUnique({ where: { id: body.bomId } })
            if (!bom) {
              throw new Error(`BOM not found: ${body.bomId}`)
            }
            
            const components = parseJson(bom.components, [])
            if (components.length === 0) {
              throw new Error(`BOM ${body.bomId} has no components`)
            }
            
            // Validate all components before allocating (fail fast)
            const componentChecks = []
            for (const component of components) {
              if (component.sku && component.quantity) {
                const requiredQty = parseFloat(component.quantity) * orderQuantity
                if (requiredQty <= 0) {
                  throw new Error(`Invalid quantity for component ${component.name || component.sku}: ${requiredQty}`)
                }
                
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: { sku: component.sku }
                })
                
                if (!inventoryItem) {
                  throw new Error(`Inventory item not found for SKU: ${component.sku}`)
                }
                
                const availableQty = inventoryItem.quantity - (inventoryItem.allocatedQuantity || 0)
                if (availableQty < requiredQty) {
                  throw new Error(`Insufficient stock for ${component.name || component.sku}. Available: ${availableQty}, Required: ${requiredQty}`)
                }
                
                componentChecks.push({ inventoryItem, requiredQty, component })
              }
            }
            
            // Allocate all components atomically
            await Promise.all(
              componentChecks.map(({ inventoryItem, requiredQty }) =>
                tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    allocatedQuantity: { increment: requiredQty }
                  }
                })
              )
            )
            
          }
          
          // Create order (will rollback allocations if this fails)
          const createData = {
            bomId: body.bomId || '',
            productSku: body.productSku,
            productName: body.productName,
            quantity: orderQuantity,
            quantityProduced: parseInt(body.quantityProduced) || 0,
            status: orderStatus,
            priority: body.priority || 'normal',
            assignedTo: body.assignedTo || '',
            totalCost: parseFloat(body.totalCost) || 0,
            notes: body.notes || '',
            workOrderNumber: body.workOrderNumber || '',
            clientId: body.clientId || null,
            allocationType: body.allocationType || 'stock',
            createdBy: body.createdBy || req.user?.name || 'System',
            ownerId: null
          };
          
          // Only set date fields if they're provided (let Prisma defaults handle the rest)
          if (body.startDate) createData.startDate = new Date(body.startDate);
          if (body.targetDate) createData.targetDate = new Date(body.targetDate);
          if (body.completedDate) createData.completedDate = new Date(body.completedDate);
          
          return await tx.productionOrder.create({ data: createData })
        })
        
        return created(res, { 
          order: {
            ...order,
            startDate: formatDate(order.startDate),
            targetDate: formatDate(order.targetDate),
            completedDate: formatDate(order.completedDate),
            createdAt: formatDate(order.createdAt),
            updatedAt: formatDate(order.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create production order:', error)
        return serverError(res, 'Failed to create production order', error.message)
      }
    }

    // UPDATE (PATCH /api/manufacturing/production-orders/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        // Get existing order to check status change
        const existingOrder = await prisma.productionOrder.findUnique({ where: { id } })
        if (!existingOrder) {
          return notFound(res, 'Production order not found')
        }
        
        const updateData = {}
        let stockWarnings = []
        
        if (body.bomId !== undefined) updateData.bomId = body.bomId
        if (body.productSku !== undefined) updateData.productSku = body.productSku
        if (body.productName !== undefined) updateData.productName = body.productName
        if (body.quantity !== undefined) updateData.quantity = parseInt(body.quantity)
        if (body.quantityProduced !== undefined) updateData.quantityProduced = parseInt(body.quantityProduced)
        if (body.status !== undefined) updateData.status = body.status
        if (body.priority !== undefined) updateData.priority = body.priority
        if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null
        if (body.targetDate !== undefined) updateData.targetDate = body.targetDate ? new Date(body.targetDate) : null
        if (body.completedDate !== undefined) updateData.completedDate = body.completedDate ? new Date(body.completedDate) : null
        if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo
        if (body.totalCost !== undefined) updateData.totalCost = parseFloat(body.totalCost)
        if (body.notes !== undefined) updateData.notes = body.notes
        if (body.workOrderNumber !== undefined) updateData.workOrderNumber = body.workOrderNumber || ''
        if (body.clientId !== undefined) updateData.clientId = body.clientId || null
        if (body.allocationType !== undefined) updateData.allocationType = body.allocationType || 'stock'
        
        // Handle status change to 'completed' - add finished goods to inventory
        const oldStatus = String(existingOrder.status || '').trim()
        const newStatus = String(body.status || '').trim()
        
        // Handle status change to 'completed' - add finished goods to inventory with cost = sum of parts
        if (newStatus === 'completed' && oldStatus !== 'completed') {
          
          if (!existingOrder.bomId) {
            return badRequest(res, 'Order has no BOM - cannot complete production')
          }
          
          try {
            await prisma.$transaction(async (tx) => {
            // Re-fetch order within transaction for consistency
            const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
            if (!orderInTx) {
              throw new Error(`Order ${id} not found`)
            }
            
            const bom = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
            if (!bom) {
              throw new Error(`BOM not found: ${orderInTx.bomId}`)
            }
            
            // DEDUCT component stock when completing production
            const components = parseJson(bom.components, [])
            const validComponents = components.filter(c => c.sku && c.quantity)
            
            // Generate next movement number (within transaction)
            const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
            let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
              ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
              : 1
            
            const quantityProduced = orderInTx.quantityProduced || orderInTx.quantity
            
            // Process all components to deduct stock
            for (const component of validComponents) {
              try {
                const requiredQty = parseFloat(component.quantity) * quantityProduced
                if (requiredQty <= 0) continue
                
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: { sku: component.sku }
                })
                
                if (!inventoryItem) {
                  console.warn(`⚠️ Inventory item not found for component ${component.sku} - skipping deduction`)
                  continue
                }
                
                // Get component location (default to main warehouse if not specified)
                let componentLocationId = inventoryItem.locationId || null
                if (!componentLocationId) {
                  let mainWarehouse = await tx.stockLocation.findFirst({ 
                    where: { code: 'LOC001' } 
                  })
                  if (!mainWarehouse) {
                    mainWarehouse = await tx.stockLocation.create({
                      data: {
                        code: 'LOC001',
                        name: 'Main Warehouse',
                        type: 'warehouse',
                        status: 'active'
                      }
                    })
                    console.log(`✅ Created default location LOC001 for component ${component.sku}`)
                  }
                  componentLocationId = mainWarehouse.id
                }
                
                // Helper to update LocationInventory for consumed components
                async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
                  if (!locationId) return null
                  
                  let li = await tx.locationInventory.findUnique({ 
                    where: { locationId_sku: { locationId, sku } } 
                  })
                  
                  if (!li) {
                    li = await tx.locationInventory.create({ 
                      data: {
                        locationId,
                        sku,
                        itemName,
                        quantity: 0,
                        unitCost: unitCost || 0,
                        reorderPoint: reorderPoint || 0,
                        status: 'out_of_stock'
                      }
                    })
                  }
                  
                  const newQty = (li.quantity || 0) + quantityDelta
                  const status = getStatusFromQuantity(newQty, li.reorderPoint || reorderPoint || 0)
                  
                  return await tx.locationInventory.update({
                    where: { id: li.id },
                    data: {
                      quantity: newQty,
                      unitCost: unitCost !== undefined ? unitCost : li.unitCost,
                      reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
                      status,
                      itemName: itemName || li.itemName
                    }
                  })
                }
                
                // Update LocationInventory for consumed component (decrease quantity)
                if (componentLocationId) {
                  await upsertLocationInventory(
                    componentLocationId,
                    component.sku,
                    component.name || component.sku,
                    -requiredQty, // Negative for consumption
                    inventoryItem.unitCost,
                    inventoryItem.reorderPoint
                  )
                }
                
                // Always deduct consumed quantity from on-hand stock.
                // Allocation is a reservation and must be released separately.
                const allocatedQty = inventoryItem.allocatedQuantity || 0
                const updateData = {
                  quantity: { decrement: requiredQty }
                }
                
                if (allocatedQty > 0) {
                  const deductFromAllocated = Math.min(requiredQty, allocatedQty)
                  updateData.allocatedQuantity = { decrement: deductFromAllocated }
                }
                
                // Update inventory item
                const newQuantity = Math.max(0, (inventoryItem.quantity || 0) - requiredQty)
                await tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    ...updateData,
                    totalValue: Math.max(0, newQuantity * (inventoryItem.unitCost || 0)),
                    status: getStatusFromQuantity(newQuantity, inventoryItem.reorderPoint || 0)
                  }
                })
                
                // Get location code for stock movement
                const componentLocation = componentLocationId ? await tx.stockLocation.findUnique({ where: { id: componentLocationId } }) : null
                const componentLocationCode = componentLocation?.code || ''
                
                // Create stock movement record (consumption should be negative)
                await tx.stockMovement.create({
                  data: {
                    movementId: `MOV${String(seq++).padStart(4, '0')}`,
                    date: new Date(),
                    type: 'consumption',
                    itemName: component.name || component.sku,
                    sku: component.sku,
                    quantity: -Math.abs(requiredQty), // Consumption should always be negative
                    fromLocation: componentLocationCode,
                    toLocation: '',
                    reference: orderInTx.workOrderNumber || id,
                    performedBy: req.user?.name || 'System',
                    notes: `Production completion - component consumption for ${orderInTx.productName} (${orderInTx.workOrderNumber || id})`
                  }
                })
              } catch (componentError) {
                console.error(`❌ Failed to deduct component ${component.sku}:`, componentError.message)
                // Continue with other components, but log the error
              }
            }
            
            // Get the finished product inventory item
            // Backward compatibility: Try to find by productSku if inventoryItemId is missing
            let finishedProduct;
            if (bom.inventoryItemId) {
              finishedProduct = await tx.inventoryItem.findUnique({
                where: { id: bom.inventoryItemId }
              })
              if (!finishedProduct) {
              }
            }
            
            if (!finishedProduct) {
              // Fallback: Find by SKU (for older BOMs without inventoryItemId)
              finishedProduct = await tx.inventoryItem.findFirst({
                where: { sku: bom.productSku, type: 'finished_good' }
              })
              if (!finishedProduct) {
                // Also try by category
                finishedProduct = await tx.inventoryItem.findFirst({
                  where: { sku: bom.productSku, category: 'finished_goods' }
                })
              }
              // Last resort: try without type/category filter
              if (!finishedProduct) {
                finishedProduct = await tx.inventoryItem.findFirst({
                  where: { sku: bom.productSku }
                })
              }
            }
            
            if (!finishedProduct) {
              const errorMsg = `Finished product inventory item not found for BOM ${bom.id}. Product SKU: ${bom.productSku || 'N/A'}. InventoryItemId: ${bom.inventoryItemId || 'N/A'}. Please update the BOM to link it to a finished product inventory item, or create the inventory item first.`
              console.error(`❌ ${errorMsg}`)
              throw new Error(errorMsg)
            }
            
            
            // Use the finishedProduct we already found above
            // quantityProduced was already defined above
            if (quantityProduced <= 0) {
              throw new Error(`Cannot complete order: quantity produced must be greater than 0`)
            }
            
            // Calculate unit cost from BOM (material cost only, sum of parts)
            const unitCost = bom.totalMaterialCost || 0 // Cost per unit = sum of all component costs (default to 0 if not set)
            if (!unitCost && bom.totalMaterialCost === null) {
            }
            
            // Calculate new quantity and value
            const newQuantity = (finishedProduct.quantity || 0) + quantityProduced
            const newTotalValue = newQuantity * unitCost
            
            // Get default location (main warehouse) for finished product
            // If no location exists, create a default one to ensure LocationInventory is always updated
            let toLocationId = finishedProduct.locationId || null
            if (!toLocationId) {
              let mainWarehouse = await tx.stockLocation.findFirst({ 
                where: { code: 'LOC001' } 
              })
              if (!mainWarehouse) {
                // Create default location if it doesn't exist
                mainWarehouse = await tx.stockLocation.create({
                  data: {
                    code: 'LOC001',
                    name: 'Main Warehouse',
                    type: 'warehouse',
                    status: 'active'
                  }
                })
                console.log(`✅ Created default location LOC001 for production order ${id}`)
              }
              toLocationId = mainWarehouse.id
            }
            
            // Helper to update LocationInventory
            async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
              if (!locationId) return null
              
              let li = await tx.locationInventory.findUnique({ 
                where: { locationId_sku: { locationId, sku } } 
              })
              
              if (!li) {
                li = await tx.locationInventory.create({ 
                  data: {
                    locationId,
                    sku,
                    itemName,
                    quantity: 0,
                    unitCost: unitCost || 0,
                    reorderPoint: reorderPoint || 0,
                    status: 'out_of_stock'
                  }
                })
              }
              
              const newQty = (li.quantity || 0) + quantityDelta
              const status = getStatusFromQuantity(newQty, li.reorderPoint || reorderPoint || 0)
              
              return await tx.locationInventory.update({
                where: { id: li.id },
                data: {
                  quantity: newQty,
                  unitCost: unitCost !== undefined ? unitCost : li.unitCost,
                  reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
                  status,
                  itemName: itemName || li.itemName,
                  lastRestocked: quantityDelta > 0 ? new Date() : li.lastRestocked
                }
              })
            }
            
            // Update LocationInventory for finished product
            if (toLocationId) {
              await upsertLocationInventory(
                toLocationId,
                finishedProduct.sku,
                finishedProduct.name,
                quantityProduced, // positive quantity for receipt
                unitCost,
                finishedProduct.reorderPoint || 0
              )
            } else {
              console.warn(`⚠️ No location ID found for finished product ${finishedProduct.sku} - LocationInventory not updated`)
            }
            
            // Create stock movement record for finished product receipt
            const location = toLocationId ? await tx.stockLocation.findUnique({ where: { id: toLocationId } }) : null
            const locationCode = location?.code || ''
            
            const movement = await tx.stockMovement.create({
              data: {
                movementId: `MOV${String(seq++).padStart(4, '0')}`,
                date: new Date(),
                type: 'receipt', // Finished product receipt (increases stock)
                itemName: finishedProduct.name,
                sku: finishedProduct.sku,
                quantity: quantityProduced, // positive for receipt
                fromLocation: '',
                toLocation: locationCode,
                reference: orderInTx.workOrderNumber || id,
                performedBy: req.user?.name || 'System',
                notes: `Production completion for ${orderInTx.productName} - Cost: ${unitCost.toFixed(2)} per unit (sum of parts)`
              }
            })
            
            
            // Update master inventory item directly (increment quantity)
            // This ensures the master is updated even if LocationInventory doesn't exist
            const currentMasterQty = finishedProduct.quantity || 0
            const newMasterQty = currentMasterQty + quantityProduced
            
            // Also recalculate from LocationInventory if it exists (for consistency)
            const totalAtLocations = await tx.locationInventory.aggregate({ 
              _sum: { quantity: true }, 
              where: { sku: finishedProduct.sku } 
            })
            const aggQtyFromLocations = totalAtLocations._sum.quantity || 0
            
            // Use the direct update as source of truth, but log if there's a discrepancy
            const finalQty = toLocationId ? aggQtyFromLocations : newMasterQty
            if (toLocationId && Math.abs(finalQty - newMasterQty) > 0.01) {
              console.warn(`⚠️ Quantity mismatch for ${finishedProduct.sku}: direct=${newMasterQty}, from locations=${aggQtyFromLocations}`)
            }
            
            // Update inventory item with final quantity
            await tx.inventoryItem.update({
              where: { id: finishedProduct.id },
              data: {
                quantity: finalQty,
                unitCost: unitCost, // Set to sum of parts
                totalValue: finalQty * unitCost,
                status: finalQty > (finishedProduct.reorderPoint || 0) ? 'in_stock' : (finalQty > 0 ? 'low_stock' : 'out_of_stock'),
                lastRestocked: new Date()
              }
            })
            
            // Update production order status to completed, and set completedDate if provided
            const completionUpdate = { status: 'completed' }
            if (body.completedDate) {
              completionUpdate.completedDate = new Date(body.completedDate)
            } else {
              completionUpdate.completedDate = new Date()
            }
            
            await tx.productionOrder.update({
              where: { id },
              data: completionUpdate
            })
            
          }, {
            timeout: 30000
          })
          } catch (transactionError) {
            console.error('❌ Transaction failed when completing production order:', transactionError)
            console.error('❌ Error details:', {
              message: transactionError.message,
              code: transactionError.code,
              id: id,
              bomId: existingOrder.bomId
            })
            
            // Provide user-friendly error message
            if (transactionError.message.includes('not found')) {
              return badRequest(res, transactionError.message)
            }
            if (transactionError.message.includes('Finished product inventory item not found')) {
              return badRequest(res, transactionError.message)
            }
            
            throw transactionError // Re-throw to be caught by outer try-catch
          }
        }
        
        // Handle status change TO 'received' - allocate/reserve stock for BOM components
        // NOTE: Orders created in 'requested' status already allocate stock during creation.
        // To avoid double-allocation, we only run this block when coming from a status
        // that did NOT previously allocate BOM components.
        if (newStatus === 'received' && oldStatus !== 'received' && oldStatus !== 'requested') {
          
          if (!existingOrder.bomId) {
          } else {
            try {
              await prisma.$transaction(async (tx) => {
                const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
                if (!orderInTx) {
                  throw new Error(`Order ${id} not found`)
                }
                
                const bom = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
                if (!bom) {
                  throw new Error(`BOM not found: ${orderInTx.bomId}`)
                }
                
                const components = parseJson(bom.components, [])
                const validComponents = components.filter(c => c.sku && c.quantity)
                
                if (validComponents.length === 0) {
                  return
                }
                
                const now = new Date()
                const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
                let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                  ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                  : 1
                
                for (const component of validComponents) {
                  const requiredQty = parseFloat(component.quantity) * orderInTx.quantity
                  if (requiredQty <= 0) continue
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) {
                    continue
                  }
                  
                  // Allocate stock (increase allocatedQuantity)
                  const currentAllocated = inventoryItem.allocatedQuantity || 0
                  await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      allocatedQuantity: currentAllocated + requiredQty,
                      // Update status if needed
                      status: (inventoryItem.quantity - (currentAllocated + requiredQty)) > (inventoryItem.reorderPoint || 0) 
                        ? 'in_stock' 
                        : ((inventoryItem.quantity - (currentAllocated + requiredQty)) > 0 ? 'low_stock' : 'out_of_stock')
                    }
                  })
                  
                  // Create stock movement record for allocation
                  await tx.stockMovement.create({
                    data: {
                      movementId: `MOV${String(seq++).padStart(4, '0')}`,
                      date: now,
                      type: 'adjustment',
                      itemName: component.name || component.sku,
                      sku: component.sku,
                      quantity: 0, // No quantity change, just allocation
                      fromLocation: '',
                      toLocation: '',
                      reference: orderInTx.workOrderNumber || id,
                      performedBy: req.user?.name || 'System',
                      notes: `Stock allocated for ${orderInTx.productName} (Order received) - ${requiredQty} reserved`
                    }
                  })
                  
                }
                
                // Update order status
                await tx.productionOrder.update({
                  where: { id },
                  data: { status: 'received' }
                })
                
              }, {
                timeout: 30000
              })
            } catch (transactionError) {
              console.error('❌ Transaction failed when allocating stock for received order:', transactionError)
              throw transactionError
            }
          }
        }
        
        // Handle stock release when changing FROM 'received' to another status (except in_production)
        if (oldStatus === 'received' && newStatus !== 'received' && newStatus !== 'in_production') {
          
          if (!existingOrder.bomId) {
          } else {
            try {
              await prisma.$transaction(async (tx) => {
                const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
                if (!orderInTx) {
                  throw new Error(`Order ${id} not found`)
                }
                
                const bom = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
                if (!bom) {
                  throw new Error(`BOM not found: ${orderInTx.bomId}`)
                }
                
                const components = parseJson(bom.components, [])
                const validComponents = components.filter(c => c.sku && c.quantity)
                
                for (const component of validComponents) {
                  const allocatedQty = parseFloat(component.quantity) * orderInTx.quantity
                  if (allocatedQty <= 0) continue
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) continue
                  
                  const currentAllocated = inventoryItem.allocatedQuantity || 0
                  const newAllocated = Math.max(0, currentAllocated - allocatedQty)
                  
                  await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      allocatedQuantity: newAllocated,
                      status: (inventoryItem.quantity - newAllocated) > (inventoryItem.reorderPoint || 0) 
                        ? 'in_stock' 
                        : ((inventoryItem.quantity - newAllocated) > 0 ? 'low_stock' : 'out_of_stock')
                    }
                  })
                  
                }
                
                // Update order status
                await tx.productionOrder.update({
                  where: { id },
                  data: { status: newStatus }
                })
              }, {
                timeout: 30000
              })
            } catch (transactionError) {
              console.error('❌ Transaction failed when deallocating stock:', transactionError)
              // Don't throw - allow status change to continue
            }
          }
        }
        
        // Handle status change from 'requested' or 'received' to 'in_production' - ALLOCATE stock
        // WRAPPED IN TRANSACTION to ensure atomicity (allocation + movement + status update)
        if (newStatus === 'in_production' && (oldStatus === 'requested' || oldStatus === 'received')) {
          
          // IDEMPOTENCY CHECK: Verify status hasn't changed (prevent double allocation)
          if (existingOrder.status !== 'requested' && existingOrder.status !== 'received') {
            return badRequest(res, `Order status is already ${existingOrder.status}, cannot process stock allocation`)
          }
          
          if (!existingOrder.bomId) {
            return badRequest(res, 'Order has no BOM - cannot allocate stock')
          }
          
          // Pre-check stock availability to provide warnings
          const bom = await prisma.bOM.findUnique({ where: { id: existingOrder.bomId } })
          if (!bom) {
            return badRequest(res, 'BOM not found')
          }
          
          const components = parseJson(bom.components, [])
          
          for (const component of components.filter(c => c.sku && c.quantity)) {
            const requiredQty = parseFloat(component.quantity) * existingOrder.quantity
            const inventoryItem = await prisma.inventoryItem.findFirst({ where: { sku: component.sku } })
            
            if (inventoryItem && inventoryItem.quantity < requiredQty) {
              stockWarnings.push({
                sku: component.sku,
                name: component.name || component.sku,
                available: inventoryItem.quantity,
                required: requiredQty,
                shortfall: requiredQty - inventoryItem.quantity
              })
            }
          }
          
          await prisma.$transaction(async (tx) => {
            // Re-fetch order within transaction for consistency
            const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
            if (!orderInTx || (orderInTx.status !== 'requested' && orderInTx.status !== 'received')) {
              throw new Error(`Order ${id} not found or already processed (status: ${orderInTx?.status || 'unknown'})`)
            }
            
            // Re-fetch BOM within transaction
            const bomInTx = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
            if (!bomInTx) {
              throw new Error(`BOM not found: ${orderInTx.bomId}`)
            }
            
            const components = parseJson(bomInTx.components, [])
            
            if (components.length === 0) {
              throw new Error(`BOM ${orderInTx.bomId} has no components - cannot allocate stock`)
            }
            
            const now = new Date()
            
            // Generate next movement number (within transaction)
            const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
            let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
              ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
              : 1
            
            // Process all components sequentially to avoid transaction conflicts
            // Sequential processing ensures one failure doesn't cause "transaction already closed" errors
            const validComponents = components.filter(c => c.sku && c.quantity)
            
            for (const component of validComponents) {
              try {
                  const requiredQty = parseFloat(component.quantity) * orderInTx.quantity
                  if (requiredQty <= 0) {
                    throw new Error(`Invalid quantity for component ${component.name || component.sku}: ${requiredQty}`)
                  }
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) {
                    throw new Error(`Inventory item not found for SKU: ${component.sku}`)
                  }
                  
                  // Check for insufficient stock and warn
                  const allocatedQty = inventoryItem.allocatedQuantity || 0
                  const totalQty = inventoryItem.quantity || 0
                  const availableQty = totalQty - allocatedQty
                  
                  if (availableQty < requiredQty) {
                    console.warn(`⚠️ Insufficient available stock for ${component.sku}: available=${availableQty}, required=${requiredQty}`)
                  }
                  
                  // ALLOCATE stock (increase allocatedQuantity) - don't deduct yet
                  const newAllocatedQty = allocatedQty + requiredQty
                  
                  // Update inventory item with allocated quantity
                  await tx.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      allocatedQuantity: newAllocatedQty,
                      // Update status based on available quantity (total - allocated)
                      status: (totalQty - newAllocatedQty) > (inventoryItem.reorderPoint || 0) 
                        ? 'in_stock' 
                        : ((totalQty - newAllocatedQty) > 0 ? 'low_stock' : 'out_of_stock')
                    }
                  })
                  
                  // Create stock movement record for allocation (no quantity change, just tracking)
                  await tx.stockMovement.create({
                    data: {
                      movementId: `MOV${String(seq++).padStart(4, '0')}`,
                      date: now,
                      type: 'adjustment',
                      itemName: component.name || component.sku,
                      sku: component.sku,
                      quantity: 0, // No quantity change, just allocation tracking
                      fromLocation: '',
                      toLocation: '',
                      reference: orderInTx.workOrderNumber || id,
                      performedBy: req.user?.name || 'System',
                      notes: `Stock allocated for ${orderInTx.productName} (Order in production) - ${requiredQty} reserved`
                    }
                  })
              } catch (componentError) {
                // Log the error and re-throw to rollback the entire transaction
                console.error(`❌ Failed to allocate component ${component.sku}:`, componentError.message)
                throw componentError
              }
            }
            
            // If coming from 'received' status, allocate finished product to stock in production
            if (oldStatus === 'received') {
              
              // Get the finished product inventory item
              let finishedProduct;
              if (bomInTx.inventoryItemId) {
                finishedProduct = await tx.inventoryItem.findUnique({
                  where: { id: bomInTx.inventoryItemId }
                })
              }
              
              if (!finishedProduct) {
                // Fallback: Find by SKU
                finishedProduct = await tx.inventoryItem.findFirst({
                  where: { sku: bomInTx.productSku }
                })
              }
              
              if (finishedProduct) {
                const orderQuantity = orderInTx.quantity
                const currentAllocated = finishedProduct.allocatedQuantity || 0
                
                // Allocate the order quantity to stock in production (increase allocatedQuantity)
                await tx.inventoryItem.update({
                  where: { id: finishedProduct.id },
                  data: {
                    allocatedQuantity: currentAllocated + orderQuantity,
                    // Set status to in_production to indicate stock is being produced
                    status: 'in_production'
                  }
                })
                
                
                // Create stock movement record for allocation
                await tx.stockMovement.create({
                  data: {
                    movementId: `MOV${String(seq++).padStart(4, '0')}`,
                    date: now,
                    type: 'adjustment',
                    itemName: finishedProduct.name,
                    sku: finishedProduct.sku,
                    quantity: 0, // No quantity change, just allocation tracking
                    fromLocation: '',
                    toLocation: '',
                    reference: orderInTx.workOrderNumber || id,
                    performedBy: req.user?.name || 'System',
                    notes: `Stock in production allocated for ${orderInTx.productName} - ${orderQuantity} units in production`
                  }
                })
              } else {
              }
            }
            
            // Update order status (final step - ensures everything else succeeded)
            await tx.productionOrder.update({
              where: { id },
              data: { status: 'in_production' }
            })
            
          }, {
            timeout: 30000 // 30 second timeout for transaction
          })
        }
        
        // Handle stock return: status change from 'in_production' to 'requested', 'received', or 'cancelled'
        // Also handle cancellation of 'requested' or 'received' orders (return allocated stock)
        if ((newStatus === 'requested' && oldStatus === 'in_production') || 
            (newStatus === 'received' && oldStatus === 'in_production') ||
            newStatus === 'cancelled') {
          
          if (!existingOrder.bomId) {
          } else {
            await prisma.$transaction(async (tx) => {
              // Re-fetch order within transaction
              const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
              if (!orderInTx) {
                throw new Error(`Order ${id} not found`)
              }
              
              const bom = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
              if (!bom) {
                throw new Error(`BOM not found: ${orderInTx.bomId}`)
              }
              
              const components = parseJson(bom.components, [])
              
              if (components.length === 0) {
                return
              }
              
              const now = new Date()
              
              // Generate next movement number
              const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
              let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                : 1
              
              // Process components sequentially
              const validComponents = components.filter(c => c.sku && c.quantity)
              
              for (const component of validComponents) {
                try {
                  const returnQty = parseFloat(component.quantity) * orderInTx.quantity
                  if (returnQty <= 0) {
                    continue
                  }
                  
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) {
                    continue
                  }
                  
                  
                  // Determine what to return based on order's previous state
                  // Scenario 1: In Production -> Requested/Received/Cancelled
                  //   - Stock was deducted from quantity (and allocatedQuantity if it existed)
                  //   - Return stock to quantity
                  //   - If going back to "requested" or "received", also re-allocate it
                  // Scenario 2: Requested -> Cancelled
                  //   - Stock was only allocated (not deducted)
                  //   - Release allocation (reduce allocatedQuantity, quantity unchanged)
                  // Scenario 3: Received -> Cancelled
                  //   - Stock was only allocated (not deducted)
                  //   - Release allocation (reduce allocatedQuantity, quantity unchanged)
                  
                  const updateData = {}
                  
                  if (oldStatus === 'in_production') {
                    // Stock was deducted - return it to quantity
                    updateData.quantity = { increment: returnQty }
                    
                    // If reverting to "requested" or "received", re-allocate the stock
                    if (newStatus === 'requested' || newStatus === 'received') {
                      updateData.allocatedQuantity = { increment: returnQty }
                    }
                    // If cancelling, just return to quantity (don't re-allocate)
                    
                  } else if ((oldStatus === 'requested' || oldStatus === 'received') && newStatus === 'cancelled') {
                    // Stock was only allocated, not deducted - release allocation
                    const currentAllocated = inventoryItem.allocatedQuantity || 0
                    if (currentAllocated >= returnQty) {
                      updateData.allocatedQuantity = { decrement: returnQty }
                    } else {
                      // Release whatever is allocated (handle edge cases)
                      if (currentAllocated > 0) {
                        updateData.allocatedQuantity = 0
                      } else {
                      }
                    }
                  }
                  
                  // Perform the update
                  if (Object.keys(updateData).length > 0) {
                    const result = await tx.inventoryItem.updateMany({
                      where: { id: inventoryItem.id },
                      data: updateData
                    })
                    
                    if (result.count === 0) {
                      continue
                    }
                    
                    // Update status based on new available quantity
                    const updated = await tx.inventoryItem.findFirst({ where: { sku: component.sku } })
                    if (updated) {
                      const newQty = updated.quantity
                      const newAllocatedQty = updated.allocatedQuantity || 0
                      const availableQty = newQty - newAllocatedQty
                      const reorderPoint = updated.reorderPoint || 0
                      const status = availableQty > reorderPoint ? 'in_stock' : (availableQty > 0 ? 'low_stock' : 'out_of_stock')
                      
                      await tx.inventoryItem.update({
                        where: { id: updated.id },
                        data: {
                          totalValue: newQty * (updated.unitCost || 0),
                          status: status
                        }
                      })
                    }
                    
                    
                    // Create stock movement record for return
                    const movementType = newStatus === 'cancelled' ? 'adjustment' : 'return'
                    await tx.stockMovement.create({
                      data: {
                        movementId: `MOV${String(seq++).padStart(4, '0')}`,
                        date: now,
                        type: movementType,
                        itemName: component.name || component.sku,
                        sku: component.sku,
                        quantity: returnQty,
                        fromLocation: '',
                        toLocation: '',
                        reference: orderInTx.workOrderNumber || id,
                        performedBy: req.user?.name || 'System',
                        notes: `Stock return for ${orderInTx.productName} - Order ${newStatus === 'cancelled' ? 'cancelled' : 'reverted to requested'} (${orderInTx.workOrderNumber || id})`
                      }
                    })
                  }
                } catch (componentError) {
                  console.error(`❌ Failed to return component ${component.sku}:`, componentError.message)
                  // Don't throw - continue with other components
                  // But log the error
                }
              }
              
              // If reverting from in_production to received/requested, deallocate finished product
              if (oldStatus === 'in_production' && (newStatus === 'received' || newStatus === 'requested')) {
                
                // Get the finished product inventory item
                let finishedProduct;
                if (bom.inventoryItemId) {
                  finishedProduct = await tx.inventoryItem.findUnique({
                    where: { id: bom.inventoryItemId }
                  })
                }
                
                if (!finishedProduct) {
                  finishedProduct = await tx.inventoryItem.findFirst({
                    where: { sku: bom.productSku }
                  })
                }
                
                if (finishedProduct) {
                  const orderQuantity = orderInTx.quantity
                  const currentAllocated = finishedProduct.allocatedQuantity || 0
                  const newAllocated = Math.max(0, currentAllocated - orderQuantity)
                  
                  // Deallocate finished product from stock in production
                  await tx.inventoryItem.update({
                    where: { id: finishedProduct.id },
                    data: {
                      allocatedQuantity: newAllocated,
                      // Update status if no longer in production
                      status: newAllocated === 0 && finishedProduct.quantity === 0 
                        ? 'out_of_stock' 
                        : (newAllocated === 0 ? 'in_stock' : finishedProduct.status)
                    }
                  })
                  
                  
                  // Create stock movement record
                  await tx.stockMovement.create({
                    data: {
                      movementId: `MOV${String(seq++).padStart(4, '0')}`,
                      date: now,
                      type: 'adjustment',
                      itemName: finishedProduct.name,
                      sku: finishedProduct.sku,
                      quantity: 0,
                      fromLocation: '',
                      toLocation: '',
                      reference: orderInTx.workOrderNumber || id,
                      performedBy: req.user?.name || 'System',
                      notes: `Stock in production deallocated for ${orderInTx.productName} - ${orderQuantity} units removed from production`
                    }
                  })
                }
              }
              
              // Update order status in transaction
              await tx.productionOrder.update({
                where: { id },
                data: { status: newStatus }
              })
              
            }, {
              timeout: 30000
            })
          }
        }
        
        // Update order with other fields (but remove status and completedDate if they were already updated in transaction)
        // Remove status and completedDate from updateData if they were handled in a transaction above
        const fieldsToUpdate = { ...updateData }
        if ((newStatus === 'completed' && oldStatus !== 'completed') ||
            (newStatus === 'in_production' && (oldStatus === 'requested' || oldStatus === 'received')) ||
            (newStatus === 'requested' && oldStatus === 'in_production') ||
            // Only treat 'received' as transaction-handled when we actually ran the
            // allocation transaction above (i.e. not when coming from 'requested')
            (newStatus === 'received' && oldStatus !== 'received' && oldStatus !== 'requested') ||
            (oldStatus === 'received' && newStatus !== 'received' && newStatus !== 'in_production') ||
            newStatus === 'cancelled') {
          // Status was already updated in the transaction above, remove it from updateData
          delete fieldsToUpdate.status
          // completedDate was also set in the transaction for 'completed' status
          if (newStatus === 'completed' && oldStatus !== 'completed') {
            delete fieldsToUpdate.completedDate
          }
        }
        
        // Only update if there are fields to update
        let order
        if (Object.keys(fieldsToUpdate).length > 0) {
          order = await prisma.productionOrder.update({
            where: { id },
            data: fieldsToUpdate
          })
        } else {
          // Just fetch the order if no fields to update
          order = await prisma.productionOrder.findUnique({ where: { id } })
        }
        
        
        // Return order with warnings if there were stock issues
        const responseData = {
          order: {
            ...order,
            startDate: formatDate(order.startDate),
            targetDate: formatDate(order.targetDate),
            completedDate: formatDate(order.completedDate),
            createdAt: formatDate(order.createdAt),
            updatedAt: formatDate(order.updatedAt)
          }
        }
        
        // Add stock warnings if they exist
        if (stockWarnings && stockWarnings.length > 0) {
          responseData.stockWarnings = stockWarnings
        }
        
        return ok(res, responseData)
      } catch (error) {
        console.error('❌ Failed to update production order:', error)
        console.error('❌ Error stack:', error.stack)
        console.error('❌ Error details:', {
          message: error.message,
          code: error.code,
          name: error.name,
          id: id,
          method: req.method
        })
        
        if (error.code === 'P2025') {
          return notFound(res, 'Production order not found')
        }
        
        // Provide more detailed error messages
        const errorMessage = error.message || 'Unknown error occurred'
        return serverError(res, 'Failed to update production order', errorMessage)
      }
    }

    // DELETE (DELETE /api/manufacturing/production-orders/:id)
    if (req.method === 'DELETE' && id) {
      try {
        // First, get the order to handle stock return before deletion
        const orderToDelete = await prisma.productionOrder.findUnique({ where: { id } })
        if (!orderToDelete) {
          return notFound(res, 'Production order not found')
        }
        
        // Return stock before deleting (wrapped in transaction)
        if (orderToDelete.bomId && (orderToDelete.status === 'requested' || orderToDelete.status === 'in_production')) {
          
          await prisma.$transaction(async (tx) => {
            const bom = await tx.bOM.findUnique({ where: { id: orderToDelete.bomId } })
            if (bom) {
              const components = parseJson(bom.components, [])
              const now = new Date()
              
              // Generate next movement number
              const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
              let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                : 1
              
              const validComponents = components.filter(c => c.sku && c.quantity)
              
              for (const component of validComponents) {
                try {
                  const returnQty = parseFloat(component.quantity) * orderToDelete.quantity
                  if (returnQty <= 0) continue
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) continue
                  
                  const updateData = {}
                  
                  if (orderToDelete.status === 'in_production') {
                    // Stock was deducted - return to quantity
                    updateData.quantity = { increment: returnQty }
                  } else if (orderToDelete.status === 'requested') {
                    // Stock was only allocated - release allocation
                    const currentAllocated = inventoryItem.allocatedQuantity || 0
                    if (currentAllocated >= returnQty) {
                      updateData.allocatedQuantity = { decrement: returnQty }
                    } else if (currentAllocated > 0) {
                      updateData.allocatedQuantity = 0
                    }
                  }
                  
                  if (Object.keys(updateData).length > 0) {
                    await tx.inventoryItem.updateMany({
                      where: { id: inventoryItem.id },
                      data: updateData
                    })
                    
                    // Update status
                    const updated = await tx.inventoryItem.findFirst({ where: { sku: component.sku } })
                    if (updated) {
                      const newQty = updated.quantity
                      const newAllocatedQty = updated.allocatedQuantity || 0
                      const availableQty = newQty - newAllocatedQty
                      const reorderPoint = updated.reorderPoint || 0
                      const status = availableQty > reorderPoint ? 'in_stock' : (availableQty > 0 ? 'low_stock' : 'out_of_stock')
                      
                      await tx.inventoryItem.update({
                        where: { id: updated.id },
                        data: {
                          totalValue: newQty * (updated.unitCost || 0),
                          status: status
                        }
                      })
                    }
                    
                    // Create stock movement record
                    await tx.stockMovement.create({
                      data: {
                        movementId: `MOV${String(seq++).padStart(4, '0')}`,
                        date: now,
                        type: 'adjustment',
                        itemName: component.name || component.sku,
                        sku: component.sku,
                        quantity: returnQty,
                        fromLocation: '',
                        toLocation: '',
                        reference: orderToDelete.workOrderNumber || id,
                        performedBy: req.user?.name || 'System',
                        notes: `Stock return - Production order deleted (${orderToDelete.workOrderNumber || id})`
                      }
                    })
                  }
                } catch (componentError) {
                  console.error(`❌ Failed to return component ${component.sku}:`, componentError.message)
                }
              }
              
            }
            
            // Delete the order
            await tx.productionOrder.delete({ where: { id } })
          }, {
            timeout: 30000
          })
        } else {
          // No stock to return - just delete
          await prisma.productionOrder.delete({ where: { id } })
        }
        
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete production order:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Production order not found')
        }
        return serverError(res, 'Failed to delete production order', error.message)
      }
    }
  }

  // STOCK MOVEMENTS (aggregate movements, legacy)
  if (resourceType === 'stock-movements') {
    // LIST (GET /api/manufacturing/stock-movements)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        // Fetch ALL movements - no filtering by type
        const movements = await prisma.stockMovement.findMany({
          orderBy: { date: 'desc' }
        })
        
        // Log movement type breakdown for debugging
        const typeBreakdown = movements.reduce((acc, m) => {
          acc[m.type] = (acc[m.type] || 0) + 1;
          return acc;
        }, {});
        
        const formatted = movements.map(movement => ({
          ...movement,
          id: movement.id,
          date: formatDate(movement.date),
          createdAt: formatDate(movement.createdAt),
          updatedAt: formatDate(movement.updatedAt)
        }))
        
        return ok(res, { movements: formatted })
      } catch (error) {
        console.error('❌ Failed to list stock movements:', error)
        return serverError(res, 'Failed to list stock movements', error.message)
      }
    }

    // GET ONE (GET /api/manufacturing/stock-movements/:id)
    if (req.method === 'GET' && id) {
      try {
        const movement = await prisma.stockMovement.findUnique({
          where: { id }
        })
        
        if (!movement) {
          return notFound(res, 'Stock movement not found')
        }
        
        return ok(res, { 
          movement: {
            ...movement,
            date: formatDate(movement.date),
            createdAt: formatDate(movement.createdAt),
            updatedAt: formatDate(movement.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get stock movement:', error)
        return serverError(res, 'Failed to get stock movement', error.message)
      }
    }

    // CREATE (POST /api/manufacturing/stock-movements)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      // Robust validation
      if (!body.type || !body.itemName || !body.sku) {
        return badRequest(res, 'type, itemName, and sku are required')
      }
      
      // Validate movement type
      const validTypes = ['receipt', 'consumption', 'production', 'transfer', 'adjustment', 'sale']
      if (!validTypes.includes(body.type)) {
        return badRequest(res, `Invalid movement type. Must be one of: ${validTypes.join(', ')}`)
      }
      
      // Validate SKU and itemName
      if (!body.sku.trim() || !body.itemName.trim()) {
        return badRequest(res, 'SKU and Item Name cannot be empty')
      }

      try {
        // Generate movement ID if not provided
        let movementId = body.movementId || body.id
        if (!movementId) {
          const lastMovement = await prisma.stockMovement.findFirst({
            orderBy: { createdAt: 'desc' }
          })
          const nextNumber = lastMovement && lastMovement.movementId?.startsWith('MOV')
            ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
            : 1
          movementId = `MOV${String(nextNumber).padStart(4, '0')}`
        }

        let quantity = parseFloat(body.quantity)
        const isAdjustment = body.type === 'adjustment'
        const type = String(body.type).toLowerCase()
        
        // Validate quantity
        if (quantity === undefined || quantity === null || isNaN(quantity)) {
          return badRequest(res, 'quantity is required and must be a valid number')
        }
        
        // Normalize quantity based on movement type
        // Receipts should always be positive (increase stock)
        // Production, consumption, and sales should always be negative (decrease stock)
        if (type === 'receipt') {
          // Ensure receipts are always positive (increase stock)
          quantity = Math.abs(quantity)
        } else if (type === 'production' || type === 'consumption' || type === 'sale') {
          // Ensure production/consumption/sale are always negative (decrease stock)
          quantity = -Math.abs(quantity)
        }
        // Adjustments can be positive or negative (user corrections)
        
        // Check for extreme values
        if (!isFinite(quantity) || Math.abs(quantity) > 1000000) {
          return badRequest(res, 'quantity must be a reasonable number')
        }
        
        // For adjustments, allow any value (positive, negative, or zero)
        // For other types, allow negative values (for corrections) but not zero
        if (!isAdjustment && quantity === 0) {
          return badRequest(res, 'quantity cannot be zero for non-adjustment movements')
        }

        // Perform movement and inventory adjustment atomically (basic aggregate store)
        const result = await prisma.$transaction(async (tx) => {
          // Resolve location IDs first (best practice: always persist IDs in movement for consistent filtering/ledger)
          let fromLocationId = body.fromLocationId || null
          let toLocationId = body.toLocationId || null
          if (!fromLocationId && (body.fromLocation || '').trim()) {
            const fromLoc = await tx.stockLocation.findFirst({
              where: { OR: [{ id: body.fromLocation.trim() }, { code: body.fromLocation.trim() }] }
            })
            if (fromLoc) fromLocationId = fromLoc.id
          }
          if (!toLocationId && (body.toLocation || '').trim()) {
            const toLoc = await tx.stockLocation.findFirst({
              where: { OR: [{ id: body.toLocation.trim() }, { code: body.toLocation.trim() }] }
            })
            if (toLoc) toLocationId = toLoc.id
          }
          if (!toLocationId && type === 'receipt') {
            const mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
            if (mainWarehouse) toLocationId = mainWarehouse.id
          }

          // Helper to get or create LocationInventory record
          async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
            if (!locationId) return null

            let li = await tx.locationInventory.findUnique({
              where: { locationId_sku: { locationId, sku } }
            })

            if (!li) {
              li = await tx.locationInventory.create({
                data: {
                  locationId,
                  sku,
                  itemName,
                  quantity: 0,
                  unitCost: unitCost || 0,
                  reorderPoint: reorderPoint || 0,
                  status: 'out_of_stock'
                }
              })
            }

            const newQty = (li.quantity || 0) + quantityDelta
            const status = getStatusFromQuantity(newQty, li.reorderPoint || reorderPoint || 0)

            return await tx.locationInventory.update({
              where: { id: li.id },
              data: {
                quantity: newQty,
                unitCost: unitCost !== undefined ? unitCost : li.unitCost,
                reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
                status,
                itemName: itemName || li.itemName,
                lastRestocked: quantityDelta > 0 ? (body.date ? new Date(body.date) : new Date()) : li.lastRestocked
              }
            })
          }

          // Create movement record (persist location IDs so ledger filtering by location is consistent)
          const movement = await tx.stockMovement.create({
            data: {
              movementId,
              date: body.date ? new Date(body.date) : new Date(),
              type: body.type,
              itemName: body.itemName.trim(),
              sku: body.sku.trim(),
              quantity,
              fromLocation: fromLocationId || '',
              toLocation: toLocationId || '',
              reference: (body.reference || '').trim(),
              performedBy: (body.performedBy || req.user?.name || 'System').trim(),
              notes: (body.notes || '').trim(),
              ownerId: null
            }
          })

          // Fetch existing inventory item by SKU
          let item = await tx.inventoryItem.findFirst({ where: { sku: body.sku } })

          let newQuantity = item?.quantity || 0

          // Handle transfer type separately
          if (type === 'transfer') {
            if (!fromLocationId || !toLocationId) {
              throw new Error('fromLocationId and toLocationId are required for transfers')
            }
            
            // Get source location inventory
            const fromLi = await tx.locationInventory.findUnique({ 
              where: { locationId_sku: { locationId: fromLocationId, sku: body.sku } } 
            })
            
            if (!fromLi || (fromLi.quantity || 0) < Math.abs(quantity)) {
              throw new Error('Insufficient stock at source location')
            }
            
            // Update source location (decrease)
            await upsertLocationInventory(
              fromLocationId, 
              body.sku, 
              body.itemName, 
              -Math.abs(quantity),
              parseFloat(body.unitCost) || undefined,
              parseFloat(body.reorderPoint) || undefined
            )
            
            // Update destination location (increase)
            await upsertLocationInventory(
              toLocationId, 
              body.sku, 
              body.itemName, 
              Math.abs(quantity),
              parseFloat(body.unitCost) || undefined,
              parseFloat(body.reorderPoint) || undefined
            )
            
            // Recalculate master aggregate from all locations
            const totalAtLocations = await tx.locationInventory.aggregate({ 
              _sum: { quantity: true }, 
              where: { sku: body.sku } 
            })
            const aggQty = totalAtLocations._sum.quantity || 0
            
            if (item) {
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantity: aggQty,
                  totalValue: aggQty * (item.unitCost || 0),
                  status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                }
              })
            }
          } else if (type === 'receipt') {
            // Create item on first receipt if it doesn't exist
            if (!item) {
              const unitCost = parseFloat(body.unitCost) || 0
              const reorderPoint = parseFloat(body.reorderPoint) || 0
              const totalValue = quantity * unitCost
              // Create with core fields
              const createData = {
                sku: body.sku,
                name: body.itemName,
                thumbnail: body.thumbnail || '',
                category: body.category || 'components',
                type: body.itemType || 'raw_material',
                quantity: quantity,
                unit: body.unit || 'pcs',
                reorderPoint,
                reorderQty: parseFloat(body.reorderQty) || 0,
                unitCost,
                totalValue,
                supplier: body.supplier || '',
                status: quantity > reorderPoint ? 'in_stock' : (quantity > 0 ? 'low_stock' : 'out_of_stock'),
                lastRestocked: body.date ? new Date(body.date) : new Date(),
                ownerId: null,
                locationId: toLocationId || null
              };
              
              // Try with new fields, fallback if columns don't exist
              try {
                item = await tx.inventoryItem.create({
                  data: {
                    ...createData,
                    supplierPartNumbers: body.supplierPartNumbers || '[]',
                    manufacturingPartNumber: body.manufacturingPartNumber || '',
                    legacyPartNumber: body.legacyPartNumber || ''
                  }
                })
              } catch (createError) {
                if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('manufacturingPartNumber') || createError.message.includes('legacyPartNumber'))) {
                  console.warn('⚠️ Stock receipt: Creating item without new fields');
                  item = await tx.inventoryItem.create({ data: createData })
                } else {
                  throw createError;
                }
              }
            } else {
              // Increment quantity and update value (quantity is already positive for receipts)
              const unitCost = body.unitCost !== undefined ? parseFloat(body.unitCost) : item.unitCost
              newQuantity = (item.quantity || 0) + quantity // quantity is positive for receipts
              const totalValue = newQuantity * (unitCost || 0)
              const reorderPoint = item.reorderPoint || 0
              const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantity: newQuantity,
                  unitCost,
                  totalValue,
                  status,
                  lastRestocked: body.date ? new Date(body.date) : new Date()
                }
              })
            }
            
            // Update LocationInventory for receipt
            if (toLocationId) {
              await upsertLocationInventory(
                toLocationId,
                body.sku,
                body.itemName,
                quantity,
                parseFloat(body.unitCost) || item?.unitCost || 0,
                parseFloat(body.reorderPoint) || item?.reorderPoint || 0
              )
              
              // Recalculate master aggregate
              const totalAtLocations = await tx.locationInventory.aggregate({ 
                _sum: { quantity: true }, 
                where: { sku: body.sku } 
              })
              const aggQty = totalAtLocations._sum.quantity || 0
              
              if (item) {
                item = await tx.inventoryItem.update({
                  where: { id: item.id },
                  data: {
                    quantity: aggQty,
                    totalValue: aggQty * (item.unitCost || 0),
                    status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                  }
                })
              }
            }
          } else if (type === 'production') {
            // Production reduces stock (consumes materials) - same logic as consumption
            if (!item) {
              throw new Error('Inventory item not found for production')
            }
            
            // quantity is already negative for production, so we add it (subtract absolute value)
            const absQty = Math.abs(quantity)
            const locationId = fromLocationId || toLocationId || item.locationId
            
            // Check location-specific stock if location is specified
            if (locationId) {
              const locInv = await tx.locationInventory.findUnique({ 
                where: { locationId_sku: { locationId, sku: body.sku } } 
              })
              if (!locInv || (locInv.quantity || 0) < absQty) {
                throw new Error(`Insufficient stock at location for production (available: ${locInv?.quantity || 0}, requested: ${absQty})`)
              }
            } else {
              // Fallback to master inventory check
              if ((item.quantity || 0) < absQty) {
                throw new Error('Insufficient stock for production')
              }
            }
            
            newQuantity = (item.quantity || 0) + quantity // quantity is negative, so this subtracts
            const totalValue = newQuantity * (item.unitCost || 0)
            const reorderPoint = item.reorderPoint || 0
            const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
            item = await tx.inventoryItem.update({
              where: { id: item.id },
              data: {
                quantity: newQuantity,
                totalValue,
                status
              }
            })
            
            // Update LocationInventory for production
            if (locationId) {
              await upsertLocationInventory(
                locationId,
                body.sku,
                body.itemName,
                quantity, // already negative
                undefined,
                undefined
              )
              
              // Recalculate master aggregate
              const totalAtLocations = await tx.locationInventory.aggregate({ 
                _sum: { quantity: true }, 
                where: { sku: body.sku } 
              })
              const aggQty = totalAtLocations._sum.quantity || 0
              
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantity: aggQty,
                  totalValue: aggQty * (item.unitCost || 0),
                  status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                }
              })
            }
          } else if (type === 'consumption' || type === 'sale') {
            if (!item) {
              throw new Error('Inventory item not found for consumption')
            }
            
            // quantity is already negative for consumption, so we add it (subtract absolute value)
            const absQty = Math.abs(quantity)
            const locationId = fromLocationId || toLocationId || item.locationId
            
            // Check location-specific stock if location is specified
            if (locationId) {
              const locInv = await tx.locationInventory.findUnique({ 
                where: { locationId_sku: { locationId, sku: body.sku } } 
              })
              if (!locInv || (locInv.quantity || 0) < absQty) {
                throw new Error(`Insufficient stock at location (available: ${locInv?.quantity || 0}, requested: ${absQty})`)
              }
            } else {
              // Fallback to master inventory check
              if ((item.quantity || 0) < absQty) {
                throw new Error('Insufficient stock to consume the requested quantity')
              }
            }
            
            newQuantity = (item.quantity || 0) + quantity // quantity is negative, so this subtracts
            const totalValue = newQuantity * (item.unitCost || 0)
            const reorderPoint = item.reorderPoint || 0
            const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
            item = await tx.inventoryItem.update({
              where: { id: item.id },
              data: {
                quantity: newQuantity,
                totalValue,
                status
              }
            })
            
            // Update LocationInventory for consumption/sale
            if (locationId) {
              await upsertLocationInventory(
                locationId,
                body.sku,
                body.itemName,
                quantity, // already negative
                undefined,
                undefined
              )
              
              // Recalculate master aggregate
              const totalAtLocations = await tx.locationInventory.aggregate({ 
                _sum: { quantity: true }, 
                where: { sku: body.sku } 
              })
              const aggQty = totalAtLocations._sum.quantity || 0
              
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantity: aggQty,
                  totalValue: aggQty * (item.unitCost || 0),
                  status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                }
              })
            }
          } else if (type === 'adjustment') {
            // Adjustments can be positive (increase) or negative (decrease)
            // Create item if it doesn't exist (for positive adjustments)
            if (!item) {
              if (quantity < 0) {
                throw new Error('Cannot adjust inventory for non-existent item with negative quantity')
              }
              // Create item with adjustment quantity
              const unitCost = parseFloat(body.unitCost) || 0
              const reorderPoint = parseFloat(body.reorderPoint) || 0
              const totalValue = quantity * unitCost
              const createData = {
                sku: body.sku,
                name: body.itemName,
                thumbnail: body.thumbnail || '',
                category: body.category || 'components',
                type: body.itemType || 'raw_material',
                quantity: quantity,
                unit: body.unit || 'pcs',
                reorderPoint,
                reorderQty: parseFloat(body.reorderQty) || 0,
                unitCost,
                totalValue,
                supplier: body.supplier || '',
                status: quantity > reorderPoint ? 'in_stock' : (quantity > 0 ? 'low_stock' : 'out_of_stock'),
                lastRestocked: body.date ? new Date(body.date) : new Date(),
                ownerId: null
              }
              try {
                item = await tx.inventoryItem.create({
                  data: {
                    ...createData,
                    supplierPartNumbers: body.supplierPartNumbers || '[]',
                    manufacturingPartNumber: body.manufacturingPartNumber || '',
                    legacyPartNumber: body.legacyPartNumber || ''
                  }
                })
              } catch (createError) {
                if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('manufacturingPartNumber') || createError.message.includes('legacyPartNumber'))) {
                  console.warn('⚠️ Stock adjustment: Creating item without new fields')
                  item = await tx.inventoryItem.create({ data: createData })
                } else {
                  throw createError
                }
              }
            } else {
              // Adjust existing item quantity (can be positive or negative)
              newQuantity = (item.quantity || 0) + quantity
              // Allow negative inventory for adjustments (user corrections)
              const totalValue = newQuantity * (item.unitCost || 0)
              const reorderPoint = item.reorderPoint || 0
              const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  quantity: newQuantity,
                  totalValue,
                  status
                }
              })
            }
            
            // Update LocationInventory for adjustment
            // Default to item's location or main warehouse if no location specified
            let locationId = fromLocationId || toLocationId || item?.locationId
            if (!locationId) {
              // Default to main warehouse for adjustments if no location specified
              const mainWarehouse = await tx.stockLocation.findFirst({ 
                where: { code: 'LOC001' } 
              })
              if (mainWarehouse) {
                locationId = mainWarehouse.id
              }
            }
            
            // Always update LocationInventory for adjustments (required for proper aggregation)
            if (locationId) {
              await upsertLocationInventory(
                locationId,
                body.sku,
                body.itemName,
                quantity,
                parseFloat(body.unitCost) || undefined,
                parseFloat(body.reorderPoint) || undefined
              )
              
              // Recalculate master aggregate from all locations
              const totalAtLocations = await tx.locationInventory.aggregate({ 
                _sum: { quantity: true }, 
                where: { sku: body.sku } 
              })
              const aggQty = totalAtLocations._sum.quantity || 0
              
              if (item) {
                item = await tx.inventoryItem.update({
                  where: { id: item.id },
                  data: {
                    quantity: aggQty,
                    totalValue: aggQty * (item.unitCost || 0),
                    status: aggQty > (item.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                  }
                })
              }
            } else {
              // If no location exists at all, update master inventory directly (fallback)
              // This should rarely happen, but ensures adjustments still work
              console.warn('⚠️ No location found for adjustment, updating master inventory directly')
              if (item) {
                newQuantity = (item.quantity || 0) + quantity
                const totalValue = newQuantity * (item.unitCost || 0)
                const reorderPoint = item.reorderPoint || 0
                const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
                item = await tx.inventoryItem.update({
                  where: { id: item.id },
                  data: {
                    quantity: newQuantity,
                    totalValue,
                    status
                  }
                })
              }
            }
          }

          return { movement, item }
        })

        return created(res, {
          movement: {
            ...result.movement,
            id: result.movement.id,
            movementId: result.movement.movementId,
            date: formatDate(result.movement.date),
            createdAt: formatDate(result.movement.createdAt),
            updatedAt: formatDate(result.movement.updatedAt)
          },
          item: result.item
            ? {
                ...result.item,
                lastRestocked: formatDate(result.item.lastRestocked),
                createdAt: formatDate(result.item.createdAt),
                updatedAt: formatDate(result.item.updatedAt)
              }
            : null
        })
      } catch (error) {
        console.error('❌ Failed to create stock movement:', error)
        
        // Handle specific error types
        if (error.code === 'P2002') {
          return badRequest(res, 'A movement with this ID already exists')
        }
        if (error.code === 'P2003') {
          return badRequest(res, 'Invalid reference to related record')
        }
        if (error.message?.includes('timeout') || error.code === 'P1008') {
          return serverError(res, 'Transaction timed out. Please try again.')
        }
        if (error.code === 'P2034') {
          return serverError(res, 'Transaction conflict. Please try again.')
        }
        
        const message = error?.message || 'Failed to create stock movement'
        return serverError(res, message, message)
      }
    }

    // DELETE ALL (DELETE /api/manufacturing/stock-movements - no id)
    if (req.method === 'DELETE' && !id) {
      try {
        const count = await prisma.stockMovement.count()
        const result = await prisma.stockMovement.deleteMany({})
        return ok(res, { deleted: true, count: result.count })
      } catch (error) {
        console.error('❌ Failed to delete all stock movements:', error)
        return serverError(res, 'Failed to delete all stock movements', error.message)
      }
    }

    // DELETE ONE (DELETE /api/manufacturing/stock-movements/:id)
    if (req.method === 'DELETE' && id) {
      try {
        await prisma.stockMovement.delete({ where: { id } })
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete stock movement:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Stock movement not found')
        }
        return serverError(res, 'Failed to delete stock movement', error.message)
      }
    }
  }

  // PRODUCTION ORDER CONSUMPTION (consume BOM components)
  if (resourceType === 'production-orders' && id && pathSegments[3] === 'consume' && req.method === 'POST') {
    try {
      const order = await prisma.productionOrder.findUnique({ where: { id } })
      if (!order) return notFound(res, 'Production order not found')

      // Determine consume quantity: from body.quantity or remaining to produce
      const body = req.body || {}
      const consumeQuantity = parseInt(body.quantity) || (order.quantity - order.quantityProduced)
      if (consumeQuantity <= 0) {
        return badRequest(res, 'quantity must be greater than 0')
      }

      // Load BOM
      const bomId = order.bomId
      if (!bomId) return badRequest(res, 'Production order has no BOM linked')
      const bom = await prisma.bOM.findUnique({ where: { id: bomId } })
      if (!bom) return notFound(res, 'BOM not found')
      const components = (() => {
        try { return JSON.parse(bom.components || '[]') } catch { return [] }
      })()

      // Compute required quantities per component
      const requirements = components.map(c => ({
        sku: c.sku || c.componentSku || '',
        itemName: c.name || c.itemName || c.componentName || '',
        quantity: (parseFloat(c.quantity) || 0) * consumeQuantity,
        unit: c.unit || 'pcs'
      })).filter(r => r.sku && r.quantity > 0)

      if (requirements.length === 0) {
        return badRequest(res, 'BOM has no consumable components')
      }

      // Get production location - default to main warehouse (LOC001)
      // In a real system, production orders might have a specific location
      const mainWarehouse = await prisma.stockLocation.findFirst({
        where: { code: 'LOC001' }
      })
      const productionLocationId = mainWarehouse?.id || null

      // Verify stock availability (check LocationInventory if location specified)
      const inventoryBySku = new Map()
      for (const reqComp of requirements) {
        const item = await prisma.inventoryItem.findFirst({ where: { sku: reqComp.sku } })
        if (!item) {
          return badRequest(res, `Inventory item ${reqComp.sku} not found`)
        }
        
        // Check location-specific stock if location is available
        if (productionLocationId) {
          const locInv = await prisma.locationInventory.findUnique({
            where: { locationId_sku: { locationId: productionLocationId, sku: reqComp.sku } }
          })
          const availableQty = locInv?.quantity || 0
          if (availableQty < reqComp.quantity) {
            return badRequest(res, `Insufficient stock at location for ${reqComp.sku}. Have ${availableQty}, need ${reqComp.quantity}`)
          }
        } else {
          // Fallback to master inventory check
          if ((item.quantity || 0) < reqComp.quantity) {
            return badRequest(res, `Insufficient stock for ${reqComp.sku}. Have ${item.quantity}, need ${reqComp.quantity}`)
          }
        }
        
        inventoryBySku.set(reqComp.sku, item)
      }

      // Consume within a transaction: create movements and decrement stock; update order.quantityProduced optionally
      const result = await prisma.$transaction(async (tx) => {
        const now = new Date()

        // Helper to update LocationInventory
        async function upsertLocationInventory(locationId, sku, itemName, quantityDelta, unitCost, reorderPoint) {
          if (!locationId) return null
          
          let li = await tx.locationInventory.findUnique({ 
            where: { locationId_sku: { locationId, sku } } 
          })
          
          if (!li) {
            li = await tx.locationInventory.create({ 
              data: {
                locationId,
                sku,
                itemName,
                quantity: 0,
                unitCost: unitCost || 0,
                reorderPoint: reorderPoint || 0,
                status: 'out_of_stock'
              }
            })
          }
          
          const newQty = (li.quantity || 0) + quantityDelta
          const status = newQty > (li.reorderPoint || reorderPoint || 0) ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')
          
          return await tx.locationInventory.update({
            where: { id: li.id },
            data: {
              quantity: newQty,
              unitCost: unitCost !== undefined ? unitCost : li.unitCost,
              reorderPoint: reorderPoint !== undefined ? reorderPoint : li.reorderPoint,
              status,
              itemName: itemName || li.itemName
            }
          })
        }

        // Generate next movement number base
        const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
        let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
          ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
          : 1

        const createdMovements = []
        for (const reqComp of requirements) {
          const item = inventoryBySku.get(reqComp.sku)
          const consumeQty = reqComp.quantity
          const newQty = (item.quantity || 0) - consumeQty
          const totalValue = newQty * (item.unitCost || 0)
          const reorderPoint = item.reorderPoint || 0
          const status = newQty > reorderPoint ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')

          // Update LocationInventory if location is specified
          if (productionLocationId) {
            await upsertLocationInventory(
              productionLocationId,
              reqComp.sku,
              reqComp.itemName || item.name,
              -consumeQty, // negative for consumption
              item.unitCost,
              item.reorderPoint
            )
            
            // Recalculate master aggregate from all locations
            const totalAtLocations = await tx.locationInventory.aggregate({ 
              _sum: { quantity: true }, 
              where: { sku: reqComp.sku } 
            })
            const aggQty = totalAtLocations._sum.quantity || 0
            
            // Update master inventory with aggregate
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: { 
                quantity: aggQty, 
                totalValue: aggQty * (item.unitCost || 0), 
                status: aggQty > reorderPoint ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
              }
            })
          } else {
            // Fallback: update master inventory directly
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: { quantity: newQty, totalValue, status }
            })
          }

          // Create movement per component (consumption should be negative)
          const movement = await tx.stockMovement.create({
            data: {
              movementId: `MOV${String(seq++).padStart(4, '0')}`,
              date: now,
              type: 'consumption',
              itemName: reqComp.itemName || item.name,
              sku: reqComp.sku,
              quantity: -Math.abs(consumeQty), // Consumption should always be negative
              fromLocation: mainWarehouse?.code || 'store',
              toLocation: 'production',
              reference: `production:${order.id}`,
              performedBy: req.user?.name || 'System',
              notes: body.notes || '',
              ownerId: null
            }
          })
          createdMovements.push(movement)
        }

        // Optionally update produced quantity progress
        const updatedOrder = await tx.productionOrder.update({
          where: { id: order.id },
          data: {
            quantityProduced: order.quantityProduced + (body.incrementProduced ? parseInt(body.incrementProduced) : 0)
          }
        })

        return { createdMovements, updatedOrder }
      })

      return ok(res, {
        consumed: true,
        movements: result.createdMovements.map(m => ({
          ...m,
          date: formatDate(m.date),
          createdAt: formatDate(m.createdAt),
          updatedAt: formatDate(m.updatedAt)
        })),
        order: {
          ...result.updatedOrder,
          startDate: formatDate(result.updatedOrder.startDate),
          targetDate: formatDate(result.updatedOrder.targetDate),
          completedDate: formatDate(result.updatedOrder.completedDate),
          createdAt: formatDate(result.updatedOrder.createdAt),
          updatedAt: formatDate(result.updatedOrder.updatedAt)
        }
      })
    } catch (error) {
      console.error('❌ Failed to consume BOM for production order:', error)
      return serverError(res, 'Failed to consume BOM for production order', error.message)
    }
  }

  // SUPPLIERS
  if (resourceType === 'suppliers') {
    // LIST (GET /api/manufacturing/suppliers)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        const suppliers = await prisma.supplier.findMany({
          orderBy: { createdAt: 'desc' }
        })
        
        const formatted = suppliers.map(supplier => ({
          ...supplier,
          createdAt: formatDate(supplier.createdAt),
          updatedAt: formatDate(supplier.updatedAt)
        }))
        
        return ok(res, { suppliers: formatted })
      } catch (error) {
        console.error('❌ Failed to list suppliers:', error)
        return serverError(res, 'Failed to list suppliers', error.message)
      }
    }

    // GET ONE (GET /api/manufacturing/suppliers/:id)
    if (req.method === 'GET' && id) {
      try {
        const supplier = await prisma.supplier.findUnique({
          where: { id }
        })
        
        if (!supplier) {
          return notFound(res, 'Supplier not found')
        }
        
        return ok(res, { 
          supplier: {
            ...supplier,
            createdAt: formatDate(supplier.createdAt),
            updatedAt: formatDate(supplier.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to get supplier:', error)
        return serverError(res, 'Failed to get supplier', error.message)
      }
    }

    // CREATE (POST /api/manufacturing/suppliers)
    if (req.method === 'POST' && !id) {
      const body = req.body || {}
      
      if (!body.name) {
        return badRequest(res, 'name is required')
      }

      try {
        // Generate supplier code if not provided
        let supplierCode = body.code
        if (!supplierCode) {
          const lastSupplier = await prisma.supplier.findFirst({
            orderBy: { createdAt: 'desc' }
          })
          const nextNumber = lastSupplier && lastSupplier.code?.startsWith('SUP')
            ? parseInt(lastSupplier.code.replace('SUP', '')) + 1
            : 1
          supplierCode = `SUP${String(nextNumber).padStart(3, '0')}`
        }
        
        const supplier = await prisma.supplier.create({
          data: {
            code: supplierCode,
            name: body.name,
            contactPerson: body.contactPerson || '',
            email: body.email || '',
            phone: body.phone || '',
            website: body.website || '',
            address: body.address || '',
            paymentTerms: body.paymentTerms || 'Net 30',
            status: body.status || 'active',
            notes: body.notes || '',
            ownerId: null
          }
        })
        
        return created(res, { 
          supplier: {
            ...supplier,
            createdAt: formatDate(supplier.createdAt),
            updatedAt: formatDate(supplier.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create supplier:', error)
        return serverError(res, 'Failed to create supplier', error.message)
      }
    }

    // UPDATE (PATCH /api/manufacturing/suppliers/:id)
    if (req.method === 'PATCH' && id) {
      const body = req.body || {}
      
      try {
        const updateData = {}
        
        if (body.code !== undefined) updateData.code = body.code
        if (body.name !== undefined) updateData.name = body.name
        if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson
        if (body.email !== undefined) updateData.email = body.email
        if (body.phone !== undefined) updateData.phone = body.phone
        if (body.website !== undefined) updateData.website = body.website
        if (body.address !== undefined) updateData.address = body.address
        if (body.paymentTerms !== undefined) updateData.paymentTerms = body.paymentTerms
        if (body.status !== undefined) updateData.status = body.status
        if (body.notes !== undefined) updateData.notes = body.notes
        
        const supplier = await prisma.supplier.update({
          where: { id },
          data: updateData
        })
        
        return ok(res, { 
          supplier: {
            ...supplier,
            createdAt: formatDate(supplier.createdAt),
            updatedAt: formatDate(supplier.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to update supplier:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Supplier not found')
        }
        return serverError(res, 'Failed to update supplier', error.message)
      }
    }

    // DELETE (DELETE /api/manufacturing/suppliers/:id)
    if (req.method === 'DELETE' && id) {
      try {
        // Check if supplier is used in any inventory items
        const inventoryItems = await prisma.inventoryItem.findMany({
          where: {
            supplier: {
              contains: id
            }
          },
          take: 1
        })
        
        if (inventoryItems.length > 0) {
          // Get supplier name for better error message
          const supplier = await prisma.supplier.findUnique({ where: { id } })
          return badRequest(res, `Cannot delete supplier: This supplier is assigned to one or more inventory items. Please update those items first.`)
        }
        
        await prisma.supplier.delete({ where: { id } })
        return ok(res, { deleted: true })
      } catch (error) {
        console.error('❌ Failed to delete supplier:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Supplier not found')
        }
        return serverError(res, 'Failed to delete supplier', error.message)
      }
    }
  }

  // PURCHASE ORDERS - Proxy to /api/purchase-orders endpoint
  if (resourceType === 'purchase-orders') {
    // Redirect to the main purchase-orders API
    // The frontend DatabaseAPI will fallback to /api/purchase-orders if this returns an error
    return badRequest(res, 'Purchase orders are handled at /api/purchase-orders, not /api/manufacturing/purchase-orders')
  }

  return badRequest(res, 'Invalid manufacturing endpoint')
  } catch (error) {
    console.error('❌ Manufacturing handler error:', error)
    console.error('❌ Error stack:', error.stack)
    return serverError(res, 'Manufacturing handler failed', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))

