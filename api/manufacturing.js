import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

async function handler(req, res) {
  const urlPath = req.url.replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[1] // inventory, boms, production-orders, stock-movements
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
        
        const item = await prisma.inventoryItem.update({
          where: { id },
          data: updateData
        })
        
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
      
      if (!body.productSku || !body.productName || !body.quantity) {
        return badRequest(res, 'productSku, productName, and quantity required')
      }

      try {
        const order = await prisma.productionOrder.create({
          data: {
            bomId: body.bomId || '',
            productSku: body.productSku,
            productName: body.productName,
            quantity: parseInt(body.quantity) || 0,
            quantityProduced: parseInt(body.quantityProduced) || 0,
            status: body.status || 'in_progress',
            priority: body.priority || 'normal',
            startDate: body.startDate ? new Date(body.startDate) : new Date(),
            targetDate: body.targetDate ? new Date(body.targetDate) : null,
            completedDate: body.completedDate ? new Date(body.completedDate) : null,
            assignedTo: body.assignedTo || '',
            totalCost: parseFloat(body.totalCost) || 0,
            notes: body.notes || '',
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

  // STOCK MOVEMENTS
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

        // Perform movement and inventory adjustment atomically
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
              item = await tx.inventoryItem.create({
                data: {
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
              })
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
          } else if (type === 'consumption') {
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

    // DELETE (DELETE /api/manufacturing/stock-movements/:id)
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

