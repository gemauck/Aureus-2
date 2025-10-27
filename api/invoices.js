// Invoices API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Invoices API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Parse the URL path - strip /api/ prefix if present
    const urlPath = req.url.replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Invoices (GET /api/invoices)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'invoices') {
      try {
        const invoices = await prisma.invoice.findMany({ 
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Invoices retrieved successfully:', invoices.length)
        return ok(res, invoices)
      } catch (dbError) {
        console.error('❌ Database error listing invoices:', dbError)
        return serverError(res, 'Failed to list invoices', dbError.message)
      }
    }

    // Create Invoice (POST /api/invoices)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'invoices') {
      const body = await parseJsonBody(req)
      if (!body.invoiceNumber) return badRequest(res, 'invoiceNumber required')

      const invoiceData = {
        invoiceNumber: body.invoiceNumber,
        client: body.client || '',
        issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: body.status || 'Draft',
        subtotal: parseFloat(body.subtotal) || 0,
        tax: parseFloat(body.tax) || 0,
        total: parseFloat(body.total) || 0,
        balance: parseFloat(body.balance) || parseFloat(body.total) || 0,
        items: Array.isArray(body.items) ? body.items : [],
        notes: body.notes || '',
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating invoice with data:', invoiceData)
      try {
        const invoice = await prisma.invoice.create({
          data: invoiceData
        })
        console.log('✅ Invoice created successfully:', invoice.id)
        return created(res, { invoice })
      } catch (dbError) {
        console.error('❌ Database error creating invoice:', dbError)
        return serverError(res, 'Failed to create invoice', dbError.message)
      }
    }

    // Get, Update, Delete Single Invoice (GET, PUT, DELETE /api/invoices/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'invoices' && id) {
      if (req.method === 'GET') {
        try {
          const invoice = await prisma.invoice.findUnique({ where: { id } })
          if (!invoice) return notFound(res)
          console.log('✅ Invoice retrieved successfully:', invoice.id)
          return ok(res, { invoice })
        } catch (dbError) {
          console.error('❌ Database error getting invoice:', dbError)
          return serverError(res, 'Failed to get invoice', dbError.message)
        }
      }
      if (req.method === 'PUT') {
        const body = await parseJsonBody(req)
        const updateData = {
          invoiceNumber: body.invoiceNumber,
          client: body.client,
          issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          status: body.status,
          subtotal: body.subtotal,
          tax: body.tax,
          total: body.total,
          balance: body.balance,
          items: body.items,
          notes: body.notes
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating invoice with data:', updateData)
        try {
          const invoice = await prisma.invoice.update({ 
            where: { id }, 
            data: updateData 
          })
          console.log('✅ Invoice updated successfully:', invoice.id)
          return ok(res, { invoice })
        } catch (dbError) {
          console.error('❌ Database error updating invoice:', dbError)
          return serverError(res, 'Failed to update invoice', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          await prisma.invoice.delete({ where: { id } })
          console.log('✅ Invoice deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting invoice:', dbError)
          return serverError(res, 'Failed to delete invoice', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or invoice action')
  } catch (e) {
    return serverError(res, 'Invoice handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
