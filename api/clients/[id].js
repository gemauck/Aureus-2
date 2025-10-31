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
    
    // Extract ID from req.params (set by Express route parameter)
    const id = req.params.id
    
    console.log('🔍 ID from params:', id)

    if (!id) {
      return badRequest(res, 'Client ID required')
    }

    // Get Single Client (GET /api/clients/[id])
    if (req.method === 'GET') {
      try {
        const client = await prisma.client.findUnique({ 
          where: { id },
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        })
        if (!client) return notFound(res)
        
        // Parse tags from ClientTag relations
        const parsedClient = {
          ...client,
          tags: client.tags ? client.tags.map(ct => ct.tag).filter(Boolean) : []
        }
        
        console.log('✅ Client retrieved successfully:', client.id)
        return ok(res, { client: parsedClient })
      } catch (dbError) {
        console.error('❌ Database error getting client:', dbError)
        return serverError(res, 'Failed to get client', dbError.message)
      }
    }

    // Update Client (PATCH /api/clients/[id])
    if (req.method === 'PATCH') {
      // Express already parsed the body via express.json() middleware
      // So use req.body instead of parseJsonBody(req)
      const body = req.body || {}
      
      // Log to file for debugging
      const fs = await import('fs')
      const logEntry = `\n=== PATCH REQUEST ===\nTime: ${new Date().toISOString()}\nClient ID: ${id}\nBody: ${JSON.stringify(body, null, 2)}\n`
      fs.writeFileSync('/tmp/client-update.log', logEntry, { flag: 'a' })
      
      const updateData = {
        name: body.name,
        industry: body.industry,
        status: body.status,
        revenue: body.revenue,
        lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
        address: body.address,
        website: body.website,
        notes: body.notes,
        contacts: Array.isArray(body.contacts) ? JSON.stringify(body.contacts) : undefined,
        followUps: Array.isArray(body.followUps) ? JSON.stringify(body.followUps) : undefined,
        projectIds: Array.isArray(body.projectIds) ? JSON.stringify(body.projectIds) : undefined,
        comments: Array.isArray(body.comments) ? JSON.stringify(body.comments) : undefined,
        sites: Array.isArray(body.sites) ? JSON.stringify(body.sites) : undefined,
        contracts: Array.isArray(body.contracts) ? JSON.stringify(body.contracts) : undefined,
        activityLog: Array.isArray(body.activityLog) ? JSON.stringify(body.activityLog) : undefined,
        services: Array.isArray(body.services) ? JSON.stringify(body.services) : (body.services ? JSON.stringify(body.services) : undefined),
        billingTerms: typeof body.billingTerms === 'object' ? JSON.stringify(body.billingTerms) : undefined
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      console.log('🔍 Updating client with data:', JSON.stringify(updateData, null, 2))
      console.log('🔍 Comments value:', updateData.comments, 'type:', typeof updateData.comments, 'length:', updateData.comments?.length)
      console.log('🔍 FollowUps value:', updateData.followUps, 'type:', typeof updateData.followUps, 'length:', updateData.followUps?.length)
      console.log('🔍 ActivityLog value:', updateData.activityLog, 'type:', typeof updateData.activityLog, 'length:', updateData.activityLog?.length)
      
      // Log the actual strings being saved
      if (updateData.comments) {
        console.log('🔍 Comments string preview:', updateData.comments.substring(0, 100))
      }
      
      try {
        console.log('🔍 Calling Prisma update with ID:', id)
        const client = await prisma.client.update({
          where: { id },
          data: updateData
        })
        console.log('✅ Client updated successfully:', client.id)
        console.log('🔍 Saved client comments:', client.comments)
        console.log('🔍 Comments type after save:', typeof client.comments, 'length:', client.comments?.length)
        console.log('🔍 Comments preview:', client.comments?.substring(0, 100))
        
        // Log to file
        const fs = await import('fs')
        const afterUpdateLog = `\n=== AFTER UPDATE ===\nClient: ${client.name}\nComments: ${client.comments}\nComments Length: ${client.comments?.length}\n`
        fs.writeFileSync('/tmp/client-update.log', afterUpdateLog, { flag: 'a' })
        
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
