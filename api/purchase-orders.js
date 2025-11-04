// Purchase Orders API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Purchase Orders API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Parse the URL path - strip /api/ prefix if present
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Purchase Orders (GET /api/purchase-orders)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'purchase-orders') {
      try {
        const purchaseOrders = await prisma.purchaseOrder.findMany({ 
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Purchase orders retrieved successfully:', purchaseOrders.length)
        return ok(res, { purchaseOrders })
      } catch (dbError) {
        console.error('❌ Database error listing purchase orders:', dbError)
        return serverError(res, 'Failed to list purchase orders', dbError.message)
      }
    }

    // Create Purchase Order (POST /api/purchase-orders)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'purchase-orders') {
      const body = await parseJsonBody(req)
      
      // Generate order number if not provided
      let orderNumber = body.orderNumber
      if (!orderNumber) {
        // Find the last order number
        const lastOrder = await prisma.purchaseOrder.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { orderNumber: true }
        })
        
        if (lastOrder && lastOrder.orderNumber && lastOrder.orderNumber.startsWith('PO')) {
          const match = lastOrder.orderNumber.match(/PO(\d+)/)
          const nextNum = match ? parseInt(match[1]) + 1 : 1
          orderNumber = `PO${String(nextNum).padStart(4, '0')}`
        } else {
          orderNumber = 'PO0001'
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

      const purchaseOrderData = {
        orderNumber,
        supplierId: body.supplierId || '',
        supplierName: body.supplierName || '',
        status: body.status || 'draft',
        priority: body.priority || 'normal',
        orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
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

      console.log('🔍 Creating purchase order with data:', purchaseOrderData)
      try {
        const purchaseOrder = await prisma.purchaseOrder.create({
          data: purchaseOrderData
        })
        
        // Parse items for response
        const responseOrder = {
          ...purchaseOrder,
          items: typeof purchaseOrder.items === 'string' ? JSON.parse(purchaseOrder.items) : purchaseOrder.items
        }
        
        console.log('✅ Purchase order created successfully:', purchaseOrder.id)
        return created(res, { purchaseOrder: responseOrder })
      } catch (dbError) {
        console.error('❌ Database error creating purchase order:', dbError)
        return serverError(res, 'Failed to create purchase order', dbError.message)
      }
    }

    // Get, Update, Delete Single Purchase Order (GET, PATCH, DELETE /api/purchase-orders/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'purchase-orders' && id) {
      if (req.method === 'GET') {
        try {
          const purchaseOrder = await prisma.purchaseOrder.findUnique({ 
            where: { id },
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  code: true
                }
              }
            }
          })
          if (!purchaseOrder) return notFound(res, 'Purchase order not found')
          
          // Parse items for response
          const responseOrder = {
            ...purchaseOrder,
            items: typeof purchaseOrder.items === 'string' ? JSON.parse(purchaseOrder.items) : purchaseOrder.items
          }
          
          console.log('✅ Purchase order retrieved successfully:', purchaseOrder.id)
          return ok(res, { purchaseOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error getting purchase order:', dbError)
          return serverError(res, 'Failed to get purchase order', dbError.message)
        }
      }
      
      if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        
        // Get existing purchase order to check status change
        const existingOrder = await prisma.purchaseOrder.findUnique({ where: { id } })
        if (!existingOrder) {
          return notFound(res, 'Purchase order not found')
        }
        
        const oldStatus = existingOrder.status
        const newStatus = body.status
        
        // Handle items field
        if (body.items !== undefined) {
          if (typeof body.items === 'string') {
            body.items = body.items
          } else if (Array.isArray(body.items)) {
            body.items = JSON.stringify(body.items)
          }
        }
        
        const updateData = {}
        
        // Build update data object
        const allowedFields = [
          'supplierId', 'supplierName', 'status', 'priority',
          'orderDate', 'expectedDate', 'receivedDate', 'subtotal', 'tax', 'total',
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
        
        // If status is changing to 'received', create stock movements
        if (newStatus === 'received' && oldStatus !== 'received') {
          console.log(`📦 Purchase order ${id} status changing to 'received' - creating stock movements`)
          
          try {
            // Parse items from existing order or update data
            const itemsToProcess = updateData.items 
              ? (typeof updateData.items === 'string' ? JSON.parse(updateData.items) : updateData.items)
              : (typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items)
            
            if (Array.isArray(itemsToProcess) && itemsToProcess.length > 0) {
              // Get the receiving location - try to get from update data or use a default
              // Note: toLocationId might need to be stored in the purchase order schema in the future
              // For now, we'll use a default location or try to find from stock locations
              
              await prisma.$transaction(async (tx) => {
                // Get last movement ID for sequencing
                const lastMovement = await tx.stockMovement.findFirst({
                  orderBy: { createdAt: 'desc' }
                })
                let seq = lastMovement && lastMovement.movementId?.startsWith('MOV')
                  ? parseInt(lastMovement.movementId.replace('MOV', '')) + 1
                  : 1
                
                const now = new Date()
                
                // Create stock movements for each item
                for (const item of itemsToProcess) {
                  if (!item.sku || !item.quantity || item.quantity <= 0) {
                    console.warn(`⚠️ Skipping invalid item in purchase order:`, item)
                    continue
                  }
                  
                  const unitCost = parseFloat(item.unitPrice) || 0
                  const quantity = parseFloat(item.quantity)
                  
                  // Create stock movement record
                  await tx.stockMovement.create({
                    data: {
                      movementId: `MOV${String(seq++).padStart(4, '0')}`,
                      date: now,
                      type: 'receipt',
                      itemName: item.name || item.sku,
                      sku: item.sku,
                      quantity: quantity,
                      fromLocation: '',
                      toLocation: '',
                      reference: existingOrder.orderNumber || id,
                      performedBy: req.user?.name || 'System',
                      notes: `Stock received from purchase order ${existingOrder.orderNumber || id} - Supplier: ${existingOrder.supplierName || 'N/A'}`,
                      ownerId: null
                    }
                  })
                  
                  // Update or create inventory item
                  let inventoryItem = await tx.inventoryItem.findFirst({
                    where: { sku: item.sku }
                  })
                  
                  if (!inventoryItem) {
                    // Create new inventory item
                    const totalValue = quantity * unitCost
                    inventoryItem = await tx.inventoryItem.create({
                      data: {
                        sku: item.sku,
                        name: item.name || item.sku,
                        category: 'components',
                        type: 'raw_material',
                        quantity: quantity,
                        unit: 'pcs',
                        reorderPoint: 0,
                        reorderQty: 0,
                        unitCost: unitCost,
                        totalValue: totalValue,
                        status: quantity > 0 ? 'in_stock' : 'out_of_stock',
                        lastRestocked: now,
                        ownerId: null
                      }
                    })
                  } else {
                    // Update existing inventory item
                    const newQuantity = (inventoryItem.quantity || 0) + quantity
                    const newUnitCost = unitCost > 0 ? unitCost : (inventoryItem.unitCost || 0)
                    const totalValue = newQuantity * newUnitCost
                    const reorderPoint = inventoryItem.reorderPoint || 0
                    const status = newQuantity > reorderPoint ? 'in_stock' : (newQuantity > 0 ? 'low_stock' : 'out_of_stock')
                    
                    await tx.inventoryItem.update({
                      where: { id: inventoryItem.id },
                      data: {
                        quantity: newQuantity,
                        unitCost: newUnitCost,
                        totalValue: totalValue,
                        status: status,
                        lastRestocked: now
                      }
                    })
                  }
                  
                  console.log(`✅ Stock movement created for ${item.sku} (${quantity} units)`)
                }
                
                // Update purchase order with received date if not set
                if (!updateData.receivedDate) {
                  updateData.receivedDate = now
                }
                
                // Update the purchase order status
                await tx.purchaseOrder.update({
                  where: { id },
                  data: updateData
                })
              }, {
                timeout: 30000
              })
              
              console.log(`✅ Stock movements created successfully for purchase order ${id}`)
            }
          } catch (stockMovementError) {
            console.error('❌ Error creating stock movements:', stockMovementError)
            return serverError(res, 'Failed to create stock movements when marking order as received', stockMovementError.message)
          }
        } else {
          // Normal update without stock movement creation
          console.log('🔍 Updating purchase order with data:', updateData)
          try {
            const purchaseOrder = await prisma.purchaseOrder.update({ 
              where: { id }, 
              data: updateData 
            })
            
            // Parse items for response
            const responseOrder = {
              ...purchaseOrder,
              items: typeof purchaseOrder.items === 'string' ? JSON.parse(purchaseOrder.items) : purchaseOrder.items
            }
            
            console.log('✅ Purchase order updated successfully:', purchaseOrder.id)
            return ok(res, { purchaseOrder: responseOrder })
          } catch (dbError) {
            console.error('❌ Database error updating purchase order:', dbError)
            return serverError(res, 'Failed to update purchase order', dbError.message)
          }
        }
        
        // After stock movements are created, return the updated order
        try {
          const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } })
          const responseOrder = {
            ...purchaseOrder,
            items: typeof purchaseOrder.items === 'string' ? JSON.parse(purchaseOrder.items) : purchaseOrder.items
          }
          return ok(res, { purchaseOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error retrieving updated purchase order:', dbError)
          return serverError(res, 'Failed to retrieve updated purchase order', dbError.message)
        }
      }
      
      if (req.method === 'DELETE') {
        try {
          await prisma.purchaseOrder.delete({ where: { id } })
          console.log('✅ Purchase order deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting purchase order:', dbError)
          return serverError(res, 'Failed to delete purchase order', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or purchase order action')
  } catch (e) {
    console.error('❌ Purchase Orders API error:', e)
    return serverError(res, 'Purchase order handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

