import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Client [id] API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // Get the ID from the URL

    console.log('🔍 Path segments:', pathSegments, 'ID:', id)

    if (!id) {
      return badRequest(res, 'Client ID required')
    }

    // Get Single Client (GET /api/clients/[id])
    if (req.method === 'GET') {
      try {
        const client = await prisma.client.findUnique({ where: { id } })
        if (!client) return notFound(res)
        console.log('✅ Client retrieved successfully:', client.id)
        return ok(res, { client })
      } catch (dbError) {
        console.error('❌ Database error getting client:', dbError)
        return serverError(res, 'Failed to get client', dbError.message)
      }
    }

    // Update Client (PATCH /api/clients/[id])
    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const updateData = {
        name: body.name,
        industry: body.industry,
        status: body.status,
        revenue: body.revenue,
        lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
        address: body.address,
        website: body.website,
        notes: body.notes,
        contacts: Array.isArray(body.contacts) ? body.contacts : undefined,
        followUps: Array.isArray(body.followUps) ? body.followUps : undefined,
        projectIds: Array.isArray(body.projectIds) ? body.projectIds : undefined,
        comments: Array.isArray(body.comments) ? body.comments : undefined,
        sites: Array.isArray(body.sites) ? body.sites : undefined,
        contracts: Array.isArray(body.contracts) ? body.contracts : undefined,
        activityLog: Array.isArray(body.activityLog) ? body.activityLog : undefined,
        billingTerms: typeof body.billingTerms === 'object' ? body.billingTerms : undefined
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      console.log('🔍 Updating client with data:', updateData)
      try {
        const client = await prisma.client.update({
          where: { id },
          data: updateData
        })
        console.log('✅ Client updated successfully:', client.id)
        return ok(res, { client })
      } catch (dbError) {
        console.error('❌ Database error updating client:', dbError)
        return serverError(res, 'Failed to update client', dbError.message)
      }
    }

    // Delete Client (DELETE /api/clients/[id])
    if (req.method === 'DELETE') {
      try {
        // First, delete all related records to avoid foreign key constraints
        console.log('🔍 Checking for related records before deleting client:', id)
        
        // Delete opportunities
        const opportunitiesDeleted = await prisma.opportunity.deleteMany({
          where: { clientId: id }
        })
        console.log('🗑️ Deleted opportunities:', opportunitiesDeleted.count)
        
        // Delete invoices
        const invoicesDeleted = await prisma.invoice.deleteMany({
          where: { clientId: id }
        })
        console.log('🗑️ Deleted invoices:', invoicesDeleted.count)
        
        // Update projects to remove client reference (set clientId to null)
        const projectsUpdated = await prisma.project.updateMany({
          where: { clientId: id },
          data: { clientId: null }
        })
        console.log('🔄 Updated projects (removed client reference):', projectsUpdated.count)
        
        // Now delete the client
        await prisma.client.delete({ where: { id } })
        console.log('✅ Client deleted successfully:', id)
        return ok(res, { 
          message: `Client deleted successfully. Also deleted ${opportunitiesDeleted.count} opportunities, ${invoicesDeleted.count} invoices, and updated ${projectsUpdated.count} projects.`
        })
      } catch (dbError) {
        console.error('❌ Database error deleting client:', dbError)
        return serverError(res, 'Failed to delete client', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Clients [id] API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
