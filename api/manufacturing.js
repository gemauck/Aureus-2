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
        const items = await prisma.inventoryItem.findMany({
          where: { ownerId: req.user?.sub },
          orderBy: { createdAt: 'desc' }
        })
        
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
      
      if (!body.sku || !body.name) {
        return badRequest(res, 'sku and name required')
      }

      try {
        const totalValue = (parseFloat(body.quantity) || 0) * (parseFloat(body.unitCost) || 0)
        const lastRestocked = body.lastRestocked ? new Date(body.lastRestocked) : new Date()
        
        const item = await prisma.inventoryItem.create({
          data: {
            sku: body.sku,
            name: body.name,
            category: body.category || 'components',
            type: body.type || 'raw_material',
            quantity: parseFloat(body.quantity) || 0,
            unit: body.unit || 'pcs',
            reorderPoint: parseFloat(body.reorderPoint) || 0,
            reorderQty: parseFloat(body.reorderQty) || 0,
            location: body.location || '',
            unitCost: parseFloat(body.unitCost) || 0,
            totalValue,
            supplier: body.supplier || '',
            status: body.status || 'in_stock',
            lastRestocked,
            ownerId: req.user?.sub
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
        const updateData = {}
        
        if (body.sku !== undefined) updateData.sku = body.sku
        if (body.name !== undefined) updateData.name = body.name
        if (body.category !== undefined) updateData.category = body.category
        if (body.type !== undefined) updateData.type = body.type
        if (body.quantity !== undefined) updateData.quantity = parseFloat(body.quantity)
        if (body.unit !== undefined) updateData.unit = body.unit
        if (body.reorderPoint !== undefined) updateData.reorderPoint = parseFloat(body.reorderPoint)
        if (body.reorderQty !== undefined) updateData.reorderQty = parseFloat(body.reorderQty)
        if (body.location !== undefined) updateData.location = body.location
        if (body.unitCost !== undefined) updateData.unitCost = parseFloat(body.unitCost)
        if (body.supplier !== undefined) updateData.supplier = body.supplier
        if (body.status !== undefined) updateData.status = body.status
        if (body.lastRestocked !== undefined) updateData.lastRestocked = body.lastRestocked ? new Date(body.lastRestocked) : null
        
        // Recalculate totalValue if quantity or unitCost changed
        if (body.quantity !== undefined || body.unitCost !== undefined) {
          const existing = await prisma.inventoryItem.findUnique({ where: { id } })
          const qty = body.quantity !== undefined ? parseFloat(body.quantity) : existing.quantity
          const cost = body.unitCost !== undefined ? parseFloat(body.unitCost) : existing.unitCost
          updateData.totalValue = qty * cost
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
        const boms = await prisma.bOM.findMany({
          where: { ownerId: req.user?.sub },
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
            ownerId: req.user?.sub
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
        const orders = await prisma.productionOrder.findMany({
          where: { ownerId: req.user?.sub },
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
            ownerId: req.user?.sub
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
        const movements = await prisma.stockMovement.findMany({
          where: { ownerId: req.user?.sub },
          orderBy: { date: 'desc' }
        })
        
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
        
        const movement = await prisma.stockMovement.create({
          data: {
            movementId,
            date: body.date ? new Date(body.date) : new Date(),
            type: body.type,
            itemName: body.itemName,
            sku: body.sku,
            quantity: parseFloat(body.quantity) || 0,
            fromLocation: body.fromLocation || '',
            toLocation: body.toLocation || '',
            reference: body.reference || '',
            performedBy: body.performedBy || req.user?.name || 'System',
            notes: body.notes || '',
            ownerId: req.user?.sub
          }
        })
        
        console.log('✅ Created stock movement:', movement.id)
        return created(res, { 
          movement: {
            ...movement,
            id: movement.id,
            date: formatDate(movement.date),
            createdAt: formatDate(movement.createdAt),
            updatedAt: formatDate(movement.updatedAt)
          }
        })
      } catch (error) {
        console.error('❌ Failed to create stock movement:', error)
        return serverError(res, 'Failed to create stock movement', error.message)
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

  return badRequest(res, 'Invalid manufacturing endpoint')
}

export default authRequired(handler)

