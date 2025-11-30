// Sales Orders API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    
    // Parse the URL path - strip /api/ prefix if present
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Sales Orders (GET /api/sales-orders)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'sales-orders') {
      try {
        const salesOrders = await prisma.salesOrder.findMany({ 
          include: {
            client: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          },
          orderBy: { createdAt: 'desc' } 
        })
        return ok(res, { salesOrders })
      } catch (dbError) {
        console.error('❌ Database error listing sales orders:', dbError)
        return serverError(res, 'Failed to list sales orders', dbError.message)
      }
    }

    // Get Sales Orders by Client (GET /api/sales-orders/client/[clientId])
    if (req.method === 'GET' && pathSegments.length === 3 && pathSegments[0] === 'sales-orders' && pathSegments[1] === 'client') {
      const clientId = pathSegments[2]
      try {
        const salesOrders = await prisma.salesOrder.findMany({ 
          where: { clientId },
          orderBy: { createdAt: 'desc' } 
        })
        return ok(res, { salesOrders })
      } catch (dbError) {
        console.error('❌ Database error getting client sales orders:', dbError)
        return serverError(res, 'Failed to get client sales orders', dbError.message)
      }
    }

    // Create Sales Order (POST /api/sales-orders)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'sales-orders') {
      const body = await parseJsonBody(req)
      
      // Generate order number if not provided
      let orderNumber = body.orderNumber
      if (!orderNumber) {
        // Find the last order number
        const lastOrder = await prisma.salesOrder.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { orderNumber: true }
        })
        
        if (lastOrder && lastOrder.orderNumber && lastOrder.orderNumber.startsWith('SO')) {
          const match = lastOrder.orderNumber.match(/SO(\d+)/)
          const nextNum = match ? parseInt(match[1]) + 1 : 1
          orderNumber = `SO${String(nextNum).padStart(4, '0')}`
        } else {
          orderNumber = 'SO0001'
        }
      }

      // Parse items if it's a string
      let items = body.items || []
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items)
        } catch (e) {
          items = []
        }
      }

      const salesOrderData = {
        orderNumber,
        clientId: body.clientId || null,
        clientName: body.clientName || '',
        opportunityId: body.opportunityId || null,
        status: body.status || 'draft',
        priority: body.priority || 'normal',
        orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
        requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
        subtotal: parseFloat(body.subtotal) || 0,
        tax: parseFloat(body.tax) || 0,
        total: parseFloat(body.total) || 0,
        items: Array.isArray(items) ? JSON.stringify(items) : '[]',
        shippingAddress: body.shippingAddress || '',
        shippingMethod: body.shippingMethod || '',
        notes: body.notes || '',
        internalNotes: body.internalNotes || '',
        ownerId: req.user?.sub || null
      }

      try {
        const salesOrder = await prisma.salesOrder.create({
          data: salesOrderData
        })
        
        // Parse items for response
        const responseOrder = {
          ...salesOrder,
          items: typeof salesOrder.items === 'string' ? JSON.parse(salesOrder.items) : salesOrder.items
        }
        
        return created(res, { salesOrder: responseOrder })
      } catch (dbError) {
        console.error('❌ Database error creating sales order:', dbError)
        return serverError(res, 'Failed to create sales order', dbError.message)
      }
    }

    // Get, Update, Delete Single Sales Order (GET, PATCH, DELETE /api/sales-orders/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'sales-orders' && id) {
      if (req.method === 'GET') {
        try {
          const salesOrder = await prisma.salesOrder.findUnique({ 
            where: { id },
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  type: true
                }
              }
            }
          })
          if (!salesOrder) return notFound(res, 'Sales order not found')
          
          // Parse items for response
          const responseOrder = {
            ...salesOrder,
            items: typeof salesOrder.items === 'string' ? JSON.parse(salesOrder.items) : salesOrder.items
          }
          
          return ok(res, { salesOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error getting sales order:', dbError)
          return serverError(res, 'Failed to get sales order', dbError.message)
        }
      }
      
      if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        
        // Handle items field
        if (body.items !== undefined) {
          if (typeof body.items === 'string') {
            body.items = body.items
          } else if (Array.isArray(body.items)) {
            body.items = JSON.stringify(body.items)
          }
        }
        
        // Get existing order to check status change
        const existingOrder = await prisma.salesOrder.findUnique({ where: { id } })
        if (!existingOrder) {
          return notFound(res, 'Sales order not found')
        }
        
        const oldStatus = String(existingOrder.status || '').trim()
        const newStatus = String(body.status || '').trim()
        const isShipped = newStatus === 'shipped' && oldStatus !== 'shipped'
        const hasShippedDate = body.shippedDate && !existingOrder.shippedDate
        
        
        // Handle stock movements when order is shipped
        if (isShipped || hasShippedDate) {
          try {
            await prisma.$transaction(async (tx) => {
              // Parse items from order
              const items = typeof existingOrder.items === 'string' 
                ? JSON.parse(existingOrder.items || '[]') 
                : (Array.isArray(existingOrder.items) ? existingOrder.items : [])
              
              
              if (items.length === 0) {
                return
              }
              
              // Get last movement for sequence number
              const lastMovement = await tx.stockMovement.findFirst({ orderBy: { createdAt: 'desc' } })
              let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                : 1
              
              // Helper to update LocationInventory
              async function upsertLocationInventory(locationId, sku, itemName, quantityDelta) {
                if (!locationId) {
                  const mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
                  if (!mainWarehouse) {
                    console.error(`❌ Main warehouse (LOC001) not found - cannot update LocationInventory for ${sku}`)
                    return null
                  }
                  locationId = mainWarehouse.id
                }
                
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
                      unitCost: 0,
                      reorderPoint: 0,
                      status: 'out_of_stock'
                    }
                  })
                }
                
                const oldQty = li.quantity || 0
                const newQty = Math.max(0, oldQty + quantityDelta) // Don't allow negative
                const status = newQty > (li.reorderPoint || 0) ? 'in_stock' : (newQty > 0 ? 'low_stock' : 'out_of_stock')
                
                
                return await tx.locationInventory.update({
                  where: { id: li.id },
                  data: {
                    quantity: newQty,
                    status
                  }
                })
              }
              
              // Process each item in the sales order
              for (const item of items) {
                if (!item.sku || !item.quantity || item.quantity <= 0) {
                  continue
                }
                
                
                const inventoryItem = await tx.inventoryItem.findFirst({
                  where: { sku: item.sku }
                })
                
                if (!inventoryItem) {
                  continue
                }
                
                const quantityToDeduct = parseFloat(item.quantity) || 0
                if (quantityToDeduct <= 0) {
                  continue
                }
                
                // Check if sufficient stock available
                const availableQty = inventoryItem.quantity || 0
                if (availableQty < quantityToDeduct) {
                  const errorMsg = `Insufficient stock for ${item.sku || item.name || 'item'}. Available: ${availableQty}, Required: ${quantityToDeduct}`
                  console.error(`❌ ${errorMsg}`)
                  throw new Error(errorMsg)
                }
                
                // Get location for inventory item (prefer item's location, then inventory item's location, then main warehouse)
                let locationId = item.locationId || inventoryItem.locationId || null
                if (!locationId) {
                  const mainWarehouse = await tx.stockLocation.findFirst({ where: { code: 'LOC001' } })
                  if (mainWarehouse) {
                    locationId = mainWarehouse.id
                  } else {
                    console.error(`❌ Main warehouse (LOC001) not found - cannot process stock movement for ${item.sku}`)
                    continue
                  }
                }
                
                // Update LocationInventory (decrease stock)
                await upsertLocationInventory(
                  locationId,
                  item.sku,
                  item.name || inventoryItem.name,
                  -quantityToDeduct // negative for sale
                )
                
                // Get location code for movement record
                const location = await tx.stockLocation.findUnique({ where: { id: locationId } })
                const locationCode = location?.code || ''
                
                // Create stock movement record
                const movement = await tx.stockMovement.create({
                  data: {
                    movementId: `MOV${String(seq++).padStart(4, '0')}`,
                    date: body.shippedDate ? new Date(body.shippedDate) : new Date(),
                    type: 'sale',
                    itemName: item.name || inventoryItem.name,
                    sku: item.sku,
                    quantity: -quantityToDeduct, // negative for sale
                    fromLocation: locationCode,
                    toLocation: '',
                    reference: existingOrder.orderNumber || id,
                    performedBy: req.user?.name || 'System',
                    notes: `Sales order ${existingOrder.orderNumber || id} - ${item.name || item.sku}`
                  }
                })
                
                
                // Recalculate master aggregate from all locations
                const totalAtLocations = await tx.locationInventory.aggregate({ 
                  _sum: { quantity: true }, 
                  where: { sku: item.sku } 
                })
                const aggQty = totalAtLocations._sum.quantity || 0
                
                // Update inventory item with aggregated quantity
                await tx.inventoryItem.update({
                  where: { id: inventoryItem.id },
                  data: {
                    quantity: aggQty,
                    totalValue: aggQty * (inventoryItem.unitCost || 0),
                    status: aggQty > (inventoryItem.reorderPoint || 0) ? 'in_stock' : (aggQty > 0 ? 'low_stock' : 'out_of_stock')
                  }
                })
                
              }
            })
            
          } catch (stockError) {
            console.error('❌ Failed to process stock movements for sales order:', stockError)
            console.error('❌ Error stack:', stockError.stack)
            // Re-throw the error so the transaction fails and the order update is blocked
            // This ensures data consistency - if stock can't be deducted, order shouldn't be shipped
            throw stockError
          }
        }
        
        const updateData = {}
        
        // Build update data object
        const allowedFields = [
          'clientId', 'clientName', 'opportunityId', 'status', 'priority',
          'orderDate', 'requiredDate', 'shippedDate', 'subtotal', 'tax', 'total',
          'items', 'shippingAddress', 'shippingMethod', 'notes', 'internalNotes'
        ]
        
        allowedFields.forEach(field => {
          if (body[field] !== undefined) {
            if (field.includes('Date') && body[field]) {
              updateData[field] = new Date(body[field])
            } else {
              updateData[field] = body[field]
            }
          }
        })
        
        try {
          const salesOrder = await prisma.salesOrder.update({ 
            where: { id }, 
            data: updateData 
          })
          
          // Parse items for response
          const responseOrder = {
            ...salesOrder,
            items: typeof salesOrder.items === 'string' ? JSON.parse(salesOrder.items) : salesOrder.items
          }
          
          return ok(res, { salesOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error updating sales order:', dbError)
          return serverError(res, 'Failed to update sales order', dbError.message)
        }
      }
      
      if (req.method === 'DELETE') {
        try {
          await prisma.salesOrder.delete({ where: { id } })
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting sales order:', dbError)
          return serverError(res, 'Failed to delete sales order', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or sales order action')
  } catch (e) {
    console.error('❌ Sales Orders API error:', e)
    return serverError(res, 'Sales order handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

