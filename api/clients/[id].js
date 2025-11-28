import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { searchAndSaveNewsForClient } from '../client-news/search.js'

async function handler(req, res) {
  try {
    console.log('🔍 Client [id] API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Extract ID from req.params (set by server routing) or fallback to URL parsing
    let id = req.params?.id
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      id = pathSegments[pathSegments.length - 1] // Get the ID from the URL
    }
    
    console.log('🔍 ID from params:', req.params?.id, 'Extracted ID:', id)

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
        
        // Parse JSON fields (proposals, contacts, etc.) and extract tags
        const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        const parsedClient = { ...client }
        
        // Parse JSON fields
        for (const field of jsonFields) {
          const value = parsedClient[field]
          if (typeof value === 'string' && value) {
            try {
              parsedClient[field] = JSON.parse(value)
            } catch (e) {
              // Set safe defaults on parse error
              parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          } else if (!value) {
            // Set defaults for missing/null fields
            parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
          }
        }
        
        // Parse tags from ClientTag relations
        parsedClient.tags = client.tags ? client.tags.map(ct => ct.tag).filter(Boolean) : []
        
        console.log('✅ Client retrieved successfully:', client.id)
        console.log('✅ Parsed proposals count:', Array.isArray(parsedClient.proposals) ? parsedClient.proposals.length : 'not an array')
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
        // Check if name is being updated - fetch current client first
        let oldName = null
        let oldWebsite = null
        if (updateData.name !== undefined) {
          const existingClient = await prisma.client.findUnique({
            where: { id },
            select: { name: true, website: true }
          })
          if (existingClient) {
            oldName = existingClient.name
            oldWebsite = existingClient.website
          }
        }
        
        // If industry is being updated, ensure it exists in Industry table
        if (updateData.industry && updateData.industry.trim()) {
          const industryName = updateData.industry.trim()
          try {
            // Check if industry exists in Industry table
            const existingIndustry = await prisma.industry.findUnique({
              where: { name: industryName }
            })
            
            if (!existingIndustry) {
              // Create the industry if it doesn't exist
              try {
                await prisma.industry.create({
                  data: {
                    name: industryName,
                    isActive: true
                  }
                })
                console.log(`✅ Created industry "${industryName}" from client update`)
              } catch (createError) {
                // Ignore unique constraint violations (race condition)
                if (!createError.message.includes('Unique constraint') && createError.code !== 'P2002') {
                  console.warn(`⚠️ Could not create industry "${industryName}":`, createError.message)
                }
              }
            } else if (!existingIndustry.isActive) {
              // Reactivate if it was deactivated
              await prisma.industry.update({
                where: { id: existingIndustry.id },
                data: { isActive: true }
              })
              console.log(`✅ Reactivated industry "${industryName}"`)
            }
          } catch (industryError) {
            // Don't block the client update if industry sync fails
            console.warn('⚠️ Error syncing industry:', industryError.message)
          }
        }
        
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
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== client.name) {
          console.log(`📰 Client name changed from "${oldName}" to "${client.name}" - triggering RSS feed update`)
          // Trigger RSS search asynchronously (don't block the response)
          searchAndSaveNewsForClient(client.id, client.name, client.website || oldWebsite || '').catch(error => {
            console.error('❌ Error updating RSS feed after name change:', error)
          })
        }
        
        // Parse JSON fields before returning (same as GET handler) - CRITICAL for services persistence
        const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        const parsedClient = { ...client }
        
        // Parse JSON fields
        for (const field of jsonFields) {
          const value = parsedClient[field]
          if (typeof value === 'string' && value) {
            try {
              parsedClient[field] = JSON.parse(value)
            } catch (e) {
              // Set safe defaults on parse error
              parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          } else if (!value) {
            // Set defaults for missing/null fields
            parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
          }
        }
        
        console.log('✅ Client updated with parsed JSON fields, services count:', Array.isArray(parsedClient.services) ? parsedClient.services.length : 0)
        return ok(res, { client: parsedClient })
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
        
        // Delete sales orders
        const salesOrdersDeleted = await prisma.salesOrder.deleteMany({
          where: { clientId: id }
        })
        console.log('🗑️ Deleted sales orders:', salesOrdersDeleted.count)
        
        // Update projects to remove client reference (set clientId to null)
        const projectsUpdated = await prisma.project.updateMany({
          where: { clientId: id },
          data: { clientId: null }
        })
        console.log('🔄 Updated projects (removed client reference):', projectsUpdated.count)
        
        // Update service calls to remove client reference (set clientId to null) if ServiceCall model exists
        let serviceCallsUpdated = { count: 0 }
        try {
          serviceCallsUpdated = await prisma.serviceCall.updateMany({
            where: { clientId: id },
            data: { clientId: null }
          })
          console.log('🔄 Updated service calls (removed client reference):', serviceCallsUpdated.count)
        } catch (error) {
          // ServiceCall model might not exist, ignore error
          console.log('ℹ️ ServiceCall model not found or no service calls to update')
        }
        
        // ClientNews, ClientTag, and StarredClient have onDelete: Cascade, so they'll be deleted automatically
        // Now delete the client
        await prisma.client.delete({ where: { id } })
        console.log('✅ Client deleted successfully:', id)
        return ok(res, { 
          message: `Client deleted successfully. Also deleted ${opportunitiesDeleted.count} opportunities, ${invoicesDeleted.count} invoices, ${salesOrdersDeleted.count} sales orders, and updated ${projectsUpdated.count} projects.`
        })
      } catch (dbError) {
        console.error('❌ Database error deleting client:', dbError)
        console.error('❌ Full error details:', JSON.stringify(dbError, null, 2))
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
