// Sales Orders API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Sales Orders API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
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
        console.log('✅ Sales orders retrieved successfully:', salesOrders.length)
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
        console.log('🔍 Sales Orders API: Fetching orders for clientId:', clientId)
        const salesOrders = await prisma.salesOrder.findMany({ 
          where: { clientId },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Client sales orders retrieved successfully:', salesOrders.length, 'for client:', clientId)
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

      console.log('🔍 Creating sales order with data:', salesOrderData)
      try {
        const salesOrder = await prisma.salesOrder.create({
          data: salesOrderData
        })
        
        // Parse items for response
        const responseOrder = {
          ...salesOrder,
          items: typeof salesOrder.items === 'string' ? JSON.parse(salesOrder.items) : salesOrder.items
        }
        
        console.log('✅ Sales order created successfully:', salesOrder.id)
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
          
          console.log('✅ Sales order retrieved successfully:', salesOrder.id)
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
        
        console.log('🔍 Updating sales order with data:', updateData)
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
          
          console.log('✅ Sales order updated successfully:', salesOrder.id)
          return ok(res, { salesOrder: responseOrder })
        } catch (dbError) {
          console.error('❌ Database error updating sales order:', dbError)
          return serverError(res, 'Failed to update sales order', dbError.message)
        }
      }
      
      if (req.method === 'DELETE') {
        try {
          await prisma.salesOrder.delete({ where: { id } })
          console.log('✅ Sales order deleted successfully:', id)
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

