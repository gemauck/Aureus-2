import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'
import { ensureBOMMigration } from './_lib/ensureBOMMigration.js'

async function handler(req, res) {
  // Ensure BOM migration is applied (non-blocking, safe)
  await ensureBOMMigration().catch(() => {}) // Ignore errors
  const urlPath = req.url.replace(/^\/api\//, '/')
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
      if (!body.name) return badRequest(res, 'name required')
      try {
        // auto code
        let code = body.code
        if (!code) {
          const last = await prisma.stockLocation.findFirst({ orderBy: { createdAt: 'desc' } })
          const next = last && last.code?.startsWith('LOC') ? parseInt(last.code.replace('LOC','')) + 1 : 1
          code = `LOC${String(next).padStart(3,'0')}`
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
            meta: JSON.stringify(body.meta || {})
          }
        })
        
        // Create inventory items for the new location based on main warehouse inventory
        try {
          const mainWarehouse = await prisma.stockLocation.findFirst({ 
            where: { code: 'LOC001' } // Main warehouse code
          })
          
          if (mainWarehouse) {
            // Get all inventory items from main warehouse
            const mainWarehouseInventory = await prisma.inventoryItem.findMany({
              where: { locationId: mainWarehouse.id }
            })
            
            // Create duplicate inventory items for the new location
            for (const item of mainWarehouseInventory) {
              await prisma.inventoryItem.create({
                data: {
                  sku: item.sku,
                  name: item.name,
                  thumbnail: item.thumbnail,
                  category: item.category,
                  type: item.type,
                  quantity: 0, // New location starts with 0 quantity
                  allocatedQuantity: 0,
                  inProductionQuantity: 0,
                  completedQuantity: 0,
                  unit: item.unit,
                  reorderPoint: item.reorderPoint,
                  reorderQty: item.reorderQty,
                  location: item.location,
                  locationId: location.id, // Link to new location
                  unitCost: item.unitCost,
                  totalValue: 0,
                  supplier: item.supplier,
                  supplierPartNumbers: item.supplierPartNumbers,
                  legacyPartNumber: item.legacyPartNumber,
                  status: 'out_of_stock', // New location starts empty
                  ownerId: item.ownerId
                }
              })
            }
            console.log(`✅ Created ${mainWarehouseInventory.length} inventory items for new location ${location.code}`)
          }
        } catch (invError) {
          console.warn('⚠️ Could not create inventory for new location:', invError.message)
          // Don't fail location creation if inventory creation fails
        }
        
        return created(res, { location })
      } catch (e) {
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
        const existsInv = await prisma.locationInventory.findFirst({ where: { locationId: id } })
        if (existsInv) return badRequest(res, 'Cannot delete location with inventory')
        await prisma.stockLocation.delete({ where: { id } })
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
            let li = await tx.locationInventory.findUnique({ where: { locationId_sku: { locationId, sku: body.sku } } })
            if (!li) {
              li = await tx.locationInventory.create({ data: {
                locationId,
                sku: body.sku,
                itemName: body.itemName,
                quantity: 0,
                unitCost: parseFloat(body.unitCost) || 0,
                reorderPoint: parseFloat(body.reorderPoint) || 0,
                status: 'in_stock'
              }})
            }
            return li
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
                  legacyPartNumber: body.legacyPartNumber || ''
                }
              })
            } catch (createError) {
              // If columns don't exist yet, create without them
              if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('legacyPartNumber'))) {
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
            const locationId = body.fromLocationId || body.locationId
            if (!locationId) return badRequest(res, 'locationId required for sale/adjustment')
            const fromLi = await upsertLocationSku(locationId)
            const delta = type === 'sale' ? -qty : (parseFloat(body.delta) || -qty)
            const newQty = (fromLi.quantity || 0) + delta
            if (newQty < 0) throw new Error('Resulting quantity cannot be negative')
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

  // Helper to format dates
  const formatDate = (date) => {
    if (!date) return null
    if (date instanceof Date) return date.toISOString().split('T')[0]
    return new Date(date).toISOString().split('T')[0]
  }

  // INVENTORY ITEMS
  if (resourceType === 'inventory') {
    // LIST (GET /api/manufacturing/inventory)
    if (req.method === 'GET' && !id) {
      try {
        const owner = req.user?.sub
        
        // Parse query parameters from URL
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
        const locationId = req.query?.locationId || req.query?.location || urlObj.searchParams.get('locationId') || urlObj.searchParams.get('location')
        
        // Build query with optional location filter
        const whereClause = {}
        if (locationId && locationId !== 'all' && locationId !== '') {
          whereClause.locationId = locationId
        }
        
        const items = await prisma.inventoryItem.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' }
        })
        console.log('🧪 Manufacturing List inventory', { owner, locationId, count: items.length })
        
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

      console.log(`📦 Starting bulk import of ${items.length} inventory items...`)

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
            
            // Try to create with new fields, fallback to core fields if columns don't exist
            let inventoryItem;
            try {
              inventoryItem = await prisma.inventoryItem.create({
                data: {
                  ...createData,
                  supplierPartNumbers: itemData.supplierPartNumbers || '[]',
                  legacyPartNumber: itemData.legacyPartNumber || ''
                }
              })
            } catch (createError) {
              if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('legacyPartNumber'))) {
                console.warn('⚠️ Bulk import: Creating items without new fields (run migration)');
                inventoryItem = await prisma.inventoryItem.create({ data: createData })
              } else {
                throw createError;
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

        console.log(`✅ Bulk import completed: ${created.length} created, ${errors.length} errors`)
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
        if ((body.supplierPartNumbers !== undefined || body.legacyPartNumber !== undefined)) {
          try {
            const updateFields = {};
            if (body.supplierPartNumbers !== undefined) updateFields.supplierPartNumbers = body.supplierPartNumbers || '[]';
            if (body.legacyPartNumber !== undefined) updateFields.legacyPartNumber = body.legacyPartNumber || '';
            
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
        
        console.log('✅ Created inventory item:', item.id)
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
        if (body.legacyPartNumber !== undefined) {
          try {
            updateData.legacyPartNumber = body.legacyPartNumber
          } catch (e) {
            // Column may not exist yet - safe to ignore
            console.warn('⚠️ legacyPartNumber field not available:', e.message)
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
          if (updateError.message && (updateError.message.includes('supplierPartNumbers') || updateError.message.includes('legacyPartNumber'))) {
            console.warn('⚠️ New inventory columns not available yet, updating without them');
            const safeUpdateData = { ...updateData };
            delete safeUpdateData.supplierPartNumbers;
            delete safeUpdateData.legacyPartNumber;
            item = await prisma.inventoryItem.update({
              where: { id },
              data: safeUpdateData
            })
          } else {
            throw updateError;
          }
        }
        
        console.log('✅ Updated inventory item:', id)
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
        await prisma.inventoryItem.delete({ where: { id } })
        console.log('✅ Deleted inventory item:', id)
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
        console.log('🧪 Manufacturing List boms - Starting query...', { owner })
        
        // Verify BOM table exists first
        try {
          const boms = await prisma.bOM.findMany({
            orderBy: { createdAt: 'desc' }
          })
          console.log('🧪 Manufacturing List boms', { owner, count: boms.length })
          
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
      // Debug payload to help diagnose 400s
      try {
        console.log('📥 Received BOM create payload:', {
          type: typeof body,
          keys: Object.keys(body || {}),
          productSku: body?.productSku,
          productName: body?.productName,
          inventoryItemId: body?.inventoryItemId
        })
      } catch (_) {}
      
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
        
        console.log('✅ Created BOM:', bom.id)
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
        console.error('❌ Failed to create BOM:', error)
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
        
        console.log('✅ Updated BOM:', id)
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
        console.log('✅ Deleted BOM:', id)
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
        console.log('🧪 Manufacturing List productionOrders', { owner, count: orders.length })
        
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
        console.log(`📦 Stock allocation check: bomId=${body.bomId}, status=${orderStatus}`)
        
        const order = await prisma.$transaction(async (tx) => {
          // First, allocate stock if needed
          if (body.bomId && orderStatus === 'requested') {
            const bom = await tx.bOM.findUnique({ where: { id: body.bomId } })
            console.log(`📦 BOM found:`, bom ? `Yes (${bom.id})` : 'No')
            if (!bom) {
              throw new Error(`BOM not found: ${body.bomId}`)
            }
            
            const components = parseJson(bom.components, [])
            console.log(`📦 BOM has ${components.length} components`)
            if (components.length === 0) {
              throw new Error(`BOM ${body.bomId} has no components`)
            }
            
            // Validate all components before allocating (fail fast)
            const componentChecks = []
            for (const component of components) {
              console.log(`📦 Processing component:`, { sku: component.sku, quantity: component.quantity, name: component.name })
              if (component.sku && component.quantity) {
                const requiredQty = parseFloat(component.quantity) * orderQuantity
                if (requiredQty <= 0) {
                  throw new Error(`Invalid quantity for component ${component.name || component.sku}: ${requiredQty}`)
                }
                
                console.log(`📦 Looking for inventory item with SKU: ${component.sku}, required: ${requiredQty}`)
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: { sku: component.sku }
                })
                
                if (!inventoryItem) {
                  throw new Error(`Inventory item not found for SKU: ${component.sku}`)
                }
                
                console.log(`📦 Inventory item found: Yes (qty: ${inventoryItem.quantity}, allocated: ${inventoryItem.allocatedQuantity || 0})`)
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
            
            console.log(`📦 Allocated stock for ${componentChecks.length} components`)
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
        
        console.log('✅ Created production order:', order.id)
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
        console.log(`🔄 Status change check: "${oldStatus}" -> "${newStatus}"`)
        console.log(`🔍 Order ID: ${id}, BOM ID: ${existingOrder.bomId || 'none'}`)
        
        // Handle status change to 'completed' - add finished goods to inventory with cost = sum of parts
        if (newStatus === 'completed' && oldStatus !== 'completed') {
          console.log(`✅ Triggering finished goods addition for production order ${id} (status: ${oldStatus} -> ${newStatus})`)
          
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
            
            // Get the finished product inventory item
            // Backward compatibility: Try to find by productSku if inventoryItemId is missing
            let finishedProduct;
            if (bom.inventoryItemId) {
              console.log(`🔍 Looking up finished product by inventoryItemId: ${bom.inventoryItemId}`)
              finishedProduct = await tx.inventoryItem.findUnique({
                where: { id: bom.inventoryItemId }
              })
              if (!finishedProduct) {
                console.log(`⚠️ Inventory item ${bom.inventoryItemId} not found, falling back to SKU lookup`)
              }
            }
            
            if (!finishedProduct) {
              // Fallback: Find by SKU (for older BOMs without inventoryItemId)
              console.log(`🔍 Looking up finished product by SKU: ${bom.productSku}`)
              finishedProduct = await tx.inventoryItem.findFirst({
                where: { sku: bom.productSku, type: 'finished_good' }
              })
              if (!finishedProduct) {
                // Also try by category
                console.log(`🔍 Trying to find by category 'finished_goods': ${bom.productSku}`)
                finishedProduct = await tx.inventoryItem.findFirst({
                  where: { sku: bom.productSku, category: 'finished_goods' }
                })
              }
              // Last resort: try without type/category filter
              if (!finishedProduct) {
                console.log(`🔍 Trying to find by SKU only (any type/category): ${bom.productSku}`)
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
            
            console.log(`✅ Found finished product: ${finishedProduct.name} (SKU: ${finishedProduct.sku}, ID: ${finishedProduct.id})`)
            
            // Use the finishedProduct we already found above
            
            const quantityProduced = orderInTx.quantityProduced || orderInTx.quantity
            if (quantityProduced <= 0) {
              throw new Error(`Cannot complete order: quantity produced must be greater than 0`)
            }
            
            // Calculate unit cost from BOM (material cost only, sum of parts)
            const unitCost = bom.totalMaterialCost || 0 // Cost per unit = sum of all component costs (default to 0 if not set)
            if (!unitCost && bom.totalMaterialCost === null) {
              console.log(`⚠️ BOM ${bom.id} has no totalMaterialCost set. Using 0 as default.`)
            }
            
            // Calculate new quantity and value
            const newQuantity = (finishedProduct.quantity || 0) + quantityProduced
            const newTotalValue = newQuantity * unitCost
            
            // Update inventory item with new quantity and cost
            await tx.inventoryItem.update({
              where: { id: finishedProduct.id },
              data: {
                quantity: newQuantity,
                unitCost: unitCost, // Set to sum of parts
                totalValue: newTotalValue,
                status: newQuantity > (finishedProduct.reorderPoint || 0) ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock'),
                lastRestocked: new Date()
              }
            })
            
            // Create stock movement record for production
            const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
            let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
              ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
              : 1
            
            await tx.stockMovement.create({
              data: {
                movementId: `MOV${String(seq).padStart(4, '0')}`,
                date: new Date(),
                type: 'production',
                itemName: finishedProduct.name,
                sku: finishedProduct.sku,
                quantity: quantityProduced,
                fromLocation: '',
                toLocation: '',
                reference: orderInTx.workOrderNumber || id,
                performedBy: req.user?.name || 'System',
                notes: `Production completion for ${orderInTx.productName} - Cost: ${unitCost.toFixed(2)} per unit (sum of parts)`
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
            
            console.log(`✅ Added ${quantityProduced} units of ${finishedProduct.name} to inventory with cost ${unitCost} per unit`)
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
        if (newStatus === 'received' && oldStatus !== 'received') {
          console.log(`📋 Triggering stock allocation for production order ${id} (status: ${oldStatus} -> ${newStatus})`)
          
          if (!existingOrder.bomId) {
            console.log(`⚠️ Order ${id} has no BOM - skipping stock allocation`)
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
                  console.log(`⚠️ BOM ${orderInTx.bomId} has no components - skipping stock allocation`)
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
                    console.log(`⚠️ Inventory item not found for SKU: ${component.sku} - skipping`)
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
                  
                  console.log(`📋 Allocated ${requiredQty} of ${component.sku} for production order ${id}`)
                }
                
                // Update order status
                await tx.productionOrder.update({
                  where: { id },
                  data: { status: 'received' }
                })
                
                console.log(`✅ Stock allocation completed for production order ${id}`)
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
          console.log(`↩️ Triggering stock deallocation for production order ${id} (status: ${oldStatus} -> ${newStatus})`)
          
          if (!existingOrder.bomId) {
            console.log(`⚠️ Order ${id} has no BOM - skipping stock deallocation`)
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
                  
                  console.log(`↩️ Deallocated ${allocatedQty} of ${component.sku} for production order ${id}`)
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
        
        // Handle status change from 'requested' or 'received' to 'in_production' - deduct stock
        // WRAPPED IN TRANSACTION to ensure atomicity (deduction + movement + status update)
        if (newStatus === 'in_production' && (oldStatus === 'requested' || oldStatus === 'received')) {
          console.log(`✅ Triggering stock deduction for production order ${id} (status: ${oldStatus} -> ${newStatus})`)
          
          // IDEMPOTENCY CHECK: Verify status hasn't changed (prevent double deduction)
          if (existingOrder.status !== 'requested' && existingOrder.status !== 'received') {
            return badRequest(res, `Order status is already ${existingOrder.status}, cannot process stock deduction`)
          }
          
          if (!existingOrder.bomId) {
            return badRequest(res, 'Order has no BOM - cannot deduct stock')
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
            console.log(`📉 BOM has ${components.length} components to process`)
            
            if (components.length === 0) {
              throw new Error(`BOM ${orderInTx.bomId} has no components - cannot deduct stock`)
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
                  
                  console.log(`📉 Processing component for deduction:`, { sku: component.sku, quantity: component.quantity, name: component.name })
                  console.log(`📉 Required quantity: ${requiredQty} (component qty: ${component.quantity} × order qty: ${orderInTx.quantity})`)
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) {
                    throw new Error(`Inventory item not found for SKU: ${component.sku}`)
                  }
                  
                  console.log(`📉 Inventory item found: Yes (current qty: ${inventoryItem.quantity}, allocated: ${inventoryItem.allocatedQuantity || 0})`)
                  
                  // Check for insufficient stock and warn (but allow negative stock)
                  const allocatedQty = inventoryItem.allocatedQuantity || 0
                  const totalQty = inventoryItem.quantity || 0
                  
                  if (totalQty < requiredQty) {
                    console.log(`⚠️ WARNING: Insufficient stock for ${component.name || component.sku}. Available: ${totalQty}, Required: ${requiredQty}. Allowing negative stock.`)
                  }
                  
                  // Warn if allocation doesn't match (for orders created before allocation tracking)
                  if (allocatedQty > 0 && allocatedQty < requiredQty) {
                    console.log(`⚠️ Allocation mismatch for ${component.sku}: allocated=${allocatedQty}, required=${requiredQty}. Proceeding with deduction from total stock.`)
                  }
                  
                  // Always allow deduction (even if it results in negative stock)
                  // Remove quantity check from where clause to allow negative stock
                  const updateData = {
                    quantity: { decrement: requiredQty }
                  }
                  
                  // Decrement allocatedQuantity if it exists (handle legacy orders and allocated stock from 'received' status)
                  // When coming from 'received' status, stock was already allocated, so we need to decrement allocatedQuantity
                  // For 'requested' status, allocatedQuantity may be 0, so we only decrement if it exists
                  if (allocatedQty > 0 || oldStatus === 'received') {
                    // For received orders, we know stock was allocated, so always decrement
                    // For requested orders, only decrement if there's allocation (may be 0 for legacy orders)
                    const decrementAmount = oldStatus === 'received' ? requiredQty : Math.min(requiredQty, allocatedQty)
                    if (decrementAmount > 0) {
                      updateData.allocatedQuantity = { decrement: decrementAmount }
                    }
                  }
                  
                  // Always update (no where clause restrictions to allow negative stock)
                  const result = await tx.inventoryItem.updateMany({
                    where: { id: inventoryItem.id },
                    data: updateData
                  })
                  
                  if (result.count === 0) {
                    // Re-fetch to see current state
                    const current = await tx.inventoryItem.findFirst({ where: { sku: component.sku } })
                    throw new Error(`Cannot deduct ${requiredQty} of ${component.sku}. Current qty: ${current?.quantity || 0}, allocated: ${current?.allocatedQuantity || 0}`)
                  }
                  
                  // Update status based on new available quantity (allow negative stock)
                  const updated = await tx.inventoryItem.findFirst({ where: { sku: component.sku } })
                  if (updated) {
                    const newQty = updated.quantity
                    const newAllocatedQty = updated.allocatedQuantity || 0
                    const availableQty = newQty - newAllocatedQty
                    const reorderPoint = updated.reorderPoint || 0
                    // Allow negative stock - show negative quantities
                    const status = newQty > reorderPoint ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')
                    
                    await tx.inventoryItem.update({
                      where: { id: updated.id },
                      data: {
                        totalValue: Math.max(0, newQty * (updated.unitCost || 0)), // Don't allow negative total value
                        status: status
                      }
                    })
                  }
                  
                  console.log(`📉 Deducted ${requiredQty} of ${component.sku} for production order ${id}`)
                  
                // Create stock movement record
                await tx.stockMovement.create({
                  data: {
                    movementId: `MOV${String(seq++).padStart(4, '0')}`,
                    date: now,
                    type: 'consumption',
                    itemName: component.name || component.sku,
                    sku: component.sku,
                    quantity: requiredQty,
                    fromLocation: '',
                    toLocation: '',
                    reference: orderInTx.workOrderNumber || id,
                    performedBy: req.user?.name || 'System',
                    notes: `Production consumption for ${orderInTx.productName} (${orderInTx.workOrderNumber || id})`
                  }
                })
              } catch (componentError) {
                // Log the error and re-throw to rollback the entire transaction
                console.error(`❌ Failed to process component ${component.sku}:`, componentError.message)
                throw componentError
              }
            }
            
            // If coming from 'received' status, allocate finished product to stock in production
            if (oldStatus === 'received') {
              console.log(`📦 Allocating finished product to stock in production for order ${id}`)
              
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
                
                console.log(`📦 Allocated ${orderQuantity} units of ${finishedProduct.name} to stock in production`)
                
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
                console.log(`⚠️ Finished product not found for SKU: ${bomInTx.productSku} - skipping allocation`)
              }
            }
            
            // Update order status (final step - ensures everything else succeeded)
            await tx.productionOrder.update({
              where: { id },
              data: { status: 'in_production' }
            })
            
            console.log(`✅ Stock deduction completed for production order ${id}`)
          }, {
            timeout: 30000 // 30 second timeout for transaction
          })
        }
        
        // Handle stock return: status change from 'in_production' to 'requested', 'received', or 'cancelled'
        // Also handle cancellation of 'requested' or 'received' orders (return allocated stock)
        if ((newStatus === 'requested' && oldStatus === 'in_production') || 
            (newStatus === 'received' && oldStatus === 'in_production') ||
            newStatus === 'cancelled') {
          console.log(`↩️ Triggering stock return for production order ${id} (status: ${oldStatus} -> ${newStatus})`)
          
          if (!existingOrder.bomId) {
            console.log(`⚠️ Order ${id} has no BOM - skipping stock return`)
          } else {
            await prisma.$transaction(async (tx) => {
              // Re-fetch order within transaction
              const orderInTx = await tx.productionOrder.findUnique({ where: { id } })
              if (!orderInTx) {
                throw new Error(`Order ${id} not found`)
              }
              
              console.log(`↩️ Looking up BOM: ${orderInTx.bomId}`)
              const bom = await tx.bOM.findUnique({ where: { id: orderInTx.bomId } })
              if (!bom) {
                throw new Error(`BOM not found: ${orderInTx.bomId}`)
              }
              
              const components = parseJson(bom.components, [])
              console.log(`↩️ BOM has ${components.length} components to return`)
              
              if (components.length === 0) {
                console.log(`⚠️ BOM ${orderInTx.bomId} has no components - skipping stock return`)
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
                    console.log(`⚠️ Invalid quantity for component ${component.sku}: ${returnQty}`)
                    continue
                  }
                  
                  console.log(`↩️ Processing component for return:`, { sku: component.sku, quantity: component.quantity, name: component.name })
                  console.log(`↩️ Return quantity: ${returnQty} (component qty: ${component.quantity} × order qty: ${orderInTx.quantity})`)
                  
                  const inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  
                  if (!inventoryItem) {
                    console.log(`⚠️ Inventory item not found for SKU: ${component.sku} - skipping`)
                    continue
                  }
                  
                  console.log(`↩️ Inventory item found: Yes (current qty: ${inventoryItem.quantity}, allocated: ${inventoryItem.allocatedQuantity || 0})`)
                  
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
                    console.log(`↩️ Returning ${returnQty} to quantity for ${component.sku} (was in production)`)
                    
                    // If reverting to "requested" or "received", re-allocate the stock
                    if (newStatus === 'requested' || newStatus === 'received') {
                      updateData.allocatedQuantity = { increment: returnQty }
                      console.log(`↩️ Re-allocating ${returnQty} for ${component.sku} (back to ${newStatus})`)
                    }
                    // If cancelling, just return to quantity (don't re-allocate)
                    
                  } else if ((oldStatus === 'requested' || oldStatus === 'received') && newStatus === 'cancelled') {
                    // Stock was only allocated, not deducted - release allocation
                    const currentAllocated = inventoryItem.allocatedQuantity || 0
                    if (currentAllocated >= returnQty) {
                      updateData.allocatedQuantity = { decrement: returnQty }
                      console.log(`↩️ Releasing ${returnQty} from allocation for ${component.sku} (cancelled ${oldStatus} order)`)
                    } else {
                      // Release whatever is allocated (handle edge cases)
                      if (currentAllocated > 0) {
                        updateData.allocatedQuantity = 0
                        console.log(`↩️ Releasing ${currentAllocated} from allocation for ${component.sku} (was less than ${returnQty})`)
                      } else {
                        console.log(`⚠️ No allocation to release for ${component.sku} (already at 0)`)
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
                      console.log(`⚠️ Could not return stock for ${component.sku} - update failed`)
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
                    
                    console.log(`↩️ Returned ${returnQty} of ${component.sku} for production order ${id}`)
                    
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
                console.log(`↩️ Deallocating finished product from stock in production for order ${id}`)
                
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
                  
                  console.log(`↩️ Deallocated ${orderQuantity} units of ${finishedProduct.name} from stock in production`)
                  
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
              
              console.log(`✅ Stock return completed for production order ${id}`)
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
            (newStatus === 'received' && oldStatus !== 'received') ||
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
        
        console.log('✅ Updated production order:', id)
        
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
          console.log('⚠️ Returning stock warnings:', stockWarnings)
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
          console.log(`🗑️ Deleting production order ${id} with stock return (status: ${orderToDelete.status})`)
          
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
                    console.log(`↩️ Returning ${returnQty} to quantity for ${component.sku} (deleting in_production order)`)
                  } else if (orderToDelete.status === 'requested') {
                    // Stock was only allocated - release allocation
                    const currentAllocated = inventoryItem.allocatedQuantity || 0
                    if (currentAllocated >= returnQty) {
                      updateData.allocatedQuantity = { decrement: returnQty }
                      console.log(`↩️ Releasing ${returnQty} from allocation for ${component.sku} (deleting requested order)`)
                    } else if (currentAllocated > 0) {
                      updateData.allocatedQuantity = 0
                      console.log(`↩️ Releasing ${currentAllocated} from allocation for ${component.sku}`)
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
              
              console.log(`✅ Stock returned for deleted production order ${id}`)
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
        
        console.log('✅ Deleted production order:', id)
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
        const movements = await prisma.stockMovement.findMany({
          orderBy: { date: 'desc' }
        })
        console.log('🧪 Manufacturing List movements', { owner, count: movements.length })
        
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
      
      if (!body.type || !body.itemName || !body.sku) {
        return badRequest(res, 'type, itemName, and sku required')
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

        const quantity = parseFloat(body.quantity) || 0
        if (quantity <= 0) {
          return badRequest(res, 'quantity must be greater than 0')
        }

        // Perform movement and inventory adjustment atomically (basic aggregate store)
        const result = await prisma.$transaction(async (tx) => {
          // Create movement record
          const movement = await tx.stockMovement.create({
            data: {
              movementId,
              date: body.date ? new Date(body.date) : new Date(),
              type: body.type, // expected: receipt | consumption | production | transfer | adjustment
              itemName: body.itemName,
              sku: body.sku,
              quantity,
              fromLocation: body.fromLocation || '',
              toLocation: body.toLocation || '',
              reference: body.reference || '',
              performedBy: body.performedBy || req.user?.name || 'System',
              notes: body.notes || '',
              ownerId: null
            }
          })

          // Fetch existing inventory item by SKU
          let item = await tx.inventoryItem.findFirst({ where: { sku: body.sku } })

          const type = String(body.type).toLowerCase()
          let newQuantity = item?.quantity || 0

          if (type === 'receipt') {
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
                ownerId: null
              };
              
              // Try with new fields, fallback if columns don't exist
              try {
                item = await tx.inventoryItem.create({
                  data: {
                    ...createData,
                    supplierPartNumbers: body.supplierPartNumbers || '[]',
                    legacyPartNumber: body.legacyPartNumber || ''
                  }
                })
              } catch (createError) {
                if (createError.message && (createError.message.includes('supplierPartNumbers') || createError.message.includes('legacyPartNumber'))) {
                  console.warn('⚠️ Stock receipt: Creating item without new fields');
                  item = await tx.inventoryItem.create({ data: createData })
                } else {
                  throw createError;
                }
              }
            } else {
              // Increment quantity and update value
              const unitCost = body.unitCost !== undefined ? parseFloat(body.unitCost) : item.unitCost
              newQuantity = (item.quantity || 0) + quantity
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
          } else if (type === 'consumption' || type === 'sale') {
            if (!item) {
              throw new Error('Inventory item not found for consumption')
            }
            if ((item.quantity || 0) < quantity) {
              throw new Error('Insufficient stock to consume the requested quantity')
            }
            newQuantity = (item.quantity || 0) - quantity
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

          return { movement, item }
        })

        console.log('✅ Created stock movement and updated inventory:', result.movement.id, result.item?.id)
        return created(res, {
          movement: {
            ...result.movement,
            id: result.movement.id,
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
        const message = error?.message || 'Failed to create stock movement'
        return serverError(res, message, message)
      }
    }

    // DELETE ALL (DELETE /api/manufacturing/stock-movements - no id)
    if (req.method === 'DELETE' && !id) {
      try {
        const count = await prisma.stockMovement.count()
        const result = await prisma.stockMovement.deleteMany({})
        console.log(`✅ Deleted all stock movements: ${result.count} of ${count}`)
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
        console.log('✅ Deleted stock movement:', id)
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

      // Verify stock availability
      const inventoryBySku = new Map()
      for (const reqComp of requirements) {
        const item = await prisma.inventoryItem.findFirst({ where: { sku: reqComp.sku } })
        if (!item) {
          return badRequest(res, `Inventory item ${reqComp.sku} not found`)
        }
        if ((item.quantity || 0) < reqComp.quantity) {
          return badRequest(res, `Insufficient stock for ${reqComp.sku}. Have ${item.quantity}, need ${reqComp.quantity}`)
        }
        inventoryBySku.set(reqComp.sku, item)
      }

      // Consume within a transaction: create movements and decrement stock; update order.quantityProduced optionally
      const result = await prisma.$transaction(async (tx) => {
        const now = new Date()

        // Generate next movement number base
        const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
        let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
          ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
          : 1

        const createdMovements = []
        for (const reqComp of requirements) {
          const item = inventoryBySku.get(reqComp.sku)
          const newQty = (item.quantity || 0) - reqComp.quantity
          const totalValue = newQty * (item.unitCost || 0)
          const reorderPoint = item.reorderPoint || 0
          const status = newQty > reorderPoint ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')

          // Update inventory
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: newQty, totalValue, status }
          })

          // Create movement per component
          const movement = await tx.stockMovement.create({
            data: {
              movementId: `MOV${String(seq++).padStart(4, '0')}`,
              date: now,
              type: 'consumption',
              itemName: reqComp.itemName || item.name,
              sku: reqComp.sku,
              quantity: reqComp.quantity,
              fromLocation: 'store',
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
        console.log('🧪 Manufacturing List suppliers', { owner, count: suppliers.length })
        
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
        
        console.log('✅ Created supplier:', supplier.id)
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
        
        console.log('✅ Updated supplier:', id)
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
        console.log('✅ Deleted supplier:', id)
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

  return badRequest(res, 'Invalid manufacturing endpoint')
}

export default authRequired(handler)

