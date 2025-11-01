import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

async function handler(req, res) {
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
        const items = await prisma.inventoryItem.findMany({
          orderBy: { createdAt: 'desc' }
        })
        console.log('🧪 Manufacturing List inventory', { owner, count: items.length })
        
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
            return 'finished_good'
          }
          
          if (partLower.includes('housing') || partLower.includes('card rev')) {
            return 'work_in_progress'
          }
          
          return 'raw_material'
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
        
        const item = await prisma.inventoryItem.create({
          data: {
            sku: sku,
            name: body.name,
            thumbnail: body.thumbnail || '',
            category: body.category || 'components',
            type: body.type || 'raw_material',
            quantity: quantity,
            unit: body.unit || 'pcs',
            reorderPoint: reorderPoint,
            reorderQty: parseFloat(body.reorderQty) || 0,
            location: body.location || '',
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
      } catch (error) {
        console.error('❌ Failed to list BOMs:', error)
        return serverError(res, 'Failed to list BOMs', error.message)
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
          productName: body?.productName
        })
      } catch (_) {}
      
      if (!body.productSku || !body.productName) {
        return badRequest(res, 'productSku and productName required')
      }

      try {
        const components = Array.isArray(body.components) ? body.components : parseJson(body.components, [])
        const totalMaterialCost = components.reduce((sum, comp) => sum + (parseFloat(comp.totalCost) || 0), 0)
        const laborCost = parseFloat(body.laborCost) || 0
        const overheadCost = parseFloat(body.overheadCost) || 0
        const totalCost = totalMaterialCost + laborCost + overheadCost
        
        const bom = await prisma.bOM.create({
          data: {
            productSku: body.productSku,
            productName: body.productName,
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
        if (body.bomId && orderStatus === 'requested') {
          const bom = await prisma.bOM.findUnique({ where: { id: body.bomId } })
          if (bom) {
            const components = parseJson(bom.components, [])
            for (const component of components) {
              if (component.sku && component.quantity) {
                const requiredQty = parseFloat(component.quantity) * orderQuantity
                const inventoryItem = await prisma.inventoryItem.findFirst({
                  where: { sku: component.sku }
                })
                if (inventoryItem) {
                  const availableQty = inventoryItem.quantity - (inventoryItem.allocatedQuantity || 0)
                  if (availableQty < requiredQty) {
                    return badRequest(res, `Insufficient stock for ${component.name || component.sku}. Available: ${availableQty}, Required: ${requiredQty}`)
                  }
                  // Allocate stock (reserve but don't deduct yet)
                  await prisma.inventoryItem.update({
                    where: { id: inventoryItem.id },
                    data: {
                      allocatedQuantity: (inventoryItem.allocatedQuantity || 0) + requiredQty
                    }
                  })
                  console.log(`📦 Allocated ${requiredQty} of ${component.sku} for work order`)
                }
              }
            }
          }
        }
        
        const order = await prisma.productionOrder.create({
          data: {
            bomId: body.bomId || '',
            productSku: body.productSku,
            productName: body.productName,
            quantity: orderQuantity,
            quantityProduced: parseInt(body.quantityProduced) || 0,
            status: orderStatus,
            priority: body.priority || 'normal',
            startDate: body.startDate ? new Date(body.startDate) : new Date(),
            targetDate: body.targetDate ? new Date(body.targetDate) : null,
            completedDate: body.completedDate ? new Date(body.completedDate) : null,
            assignedTo: body.assignedTo || '',
            totalCost: parseFloat(body.totalCost) || 0,
            notes: body.notes || '',
            workOrderNumber: body.workOrderNumber || '',
            clientId: body.clientId || null,
            allocationType: body.allocationType || 'stock',
            createdBy: body.createdBy || req.user?.name || 'System',
            ownerId: null
          }
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
        
        // Handle status change from 'requested' to 'in_production' - deduct stock
        console.log(`🔄 Status change check: "${existingOrder.status}" -> "${body.status}"`)
        console.log(`🔍 Full order data:`, JSON.stringify(existingOrder, null, 2))
        if (body.status === 'in_production' && existingOrder.status === 'requested') {
          console.log(`✅ Triggering stock deduction for work order ${id} (status: ${existingOrder.status} -> ${body.status})`)
          if (existingOrder.bomId) {
            const bom = await prisma.bOM.findUnique({ where: { id: existingOrder.bomId } })
            if (bom) {
              const components = parseJson(bom.components, [])
              const now = new Date()
              
              // Generate next movement number
              const lastMovement = await prisma.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
              let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                : 1
              
              for (const component of components) {
                if (component.sku && component.quantity) {
                  const requiredQty = parseFloat(component.quantity) * existingOrder.quantity
                  const inventoryItem = await prisma.inventoryItem.findFirst({
                    where: { sku: component.sku }
                  })
                  if (inventoryItem) {
                    // Verify allocation exists and sufficient stock
                    const allocatedQty = inventoryItem.allocatedQuantity || 0
                    if (allocatedQty < requiredQty) {
                      return badRequest(res, `Allocation error for ${component.name || component.sku}. Allocated: ${allocatedQty}, Required: ${requiredQty}`)
                    }
                    if ((inventoryItem.quantity || 0) < requiredQty) {
                      return badRequest(res, `Insufficient stock for ${component.name || component.sku}. Available: ${inventoryItem.quantity}, Required: ${requiredQty}`)
                    }
                    
                    // Deduct stock and reduce allocation
                    const newQty = (inventoryItem.quantity || 0) - requiredQty
                    const newAllocatedQty = allocatedQty - requiredQty
                    const totalValue = newQty * (inventoryItem.unitCost || 0)
                    const reorderPoint = inventoryItem.reorderPoint || 0
                    // Use available quantity (quantity - allocatedQuantity) for status
                    const availableQty = newQty - newAllocatedQty
                    const status = availableQty > reorderPoint ? 'in_stock' : (availableQty > 0 ? 'low_stock' : 'out_of_stock')
                    
                    await prisma.inventoryItem.update({
                      where: { id: inventoryItem.id },
                      data: {
                        quantity: newQty,
                        allocatedQuantity: newAllocatedQty,
                        totalValue: totalValue,
                        status: status
                      }
                    })
                    console.log(`📉 Deducted ${requiredQty} of ${component.sku} for work order ${id} (allocation reduced)`)
                    
                    // Create stock movement record
                    await prisma.stockMovement.create({
                      data: {
                        movementId: `MOV${String(seq++).padStart(4, '0')}`,
                        date: now,
                        type: 'consumption',
                        itemName: component.name || component.sku,
                        sku: component.sku,
                        quantity: requiredQty,
                        fromLocation: '',
                        toLocation: '',
                        reference: existingOrder.workOrderNumber || id,
                        performedBy: req.user?.name || 'System',
                        notes: `Production consumption for ${existingOrder.productName} (${existingOrder.workOrderNumber || id})`
                      }
                    })
                  }
                }
              }
            }
          }
        }
        
        const order = await prisma.productionOrder.update({
          where: { id },
          data: updateData
        })
        
        console.log('✅ Updated production order:', id)
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
        console.error('❌ Failed to update production order:', error)
        if (error.code === 'P2025') {
          return notFound(res, 'Production order not found')
        }
        return serverError(res, 'Failed to update production order', error.message)
      }
    }

    // DELETE (DELETE /api/manufacturing/production-orders/:id)
    if (req.method === 'DELETE' && id) {
      try {
        await prisma.productionOrder.delete({ where: { id } })
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

