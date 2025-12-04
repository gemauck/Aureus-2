import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { searchAndSaveNewsForClient } from '../client-news/search.js'
import { logDatabaseError, isConnectionError } from '../_lib/dbErrorHandler.js'

async function handler(req, res) {
  try {
    
    // Extract ID from req.params (set by server routing) or fallback to URL parsing
    let id = req.params?.id
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      id = pathSegments[pathSegments.length - 1] // Get the ID from the URL
    }
    

    if (!id) {
      return badRequest(res, 'Client ID required')
    }

    // Get Single Client (GET /api/clients/[id])
    if (req.method === 'GET') {
      try {
        // Always query client basic first to avoid any relation issues
        const clientBasic = await prisma.client.findUnique({ 
          where: { id },
          // Don't include any relations initially to avoid schema mismatches
        })
        
        if (!clientBasic) {
          return notFound(res)
        }

        // Get group memberships separately with defensive handling
        let groupMemberships = []
        try {
          const memberships = await prisma.clientCompanyGroup.findMany({
            where: { clientId: id },
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  industry: true
                }
              }
            }
          })

          // Filter out orphaned memberships (where group is null) and auto-cleanup
          const validMemberships = memberships.filter(m => m.group !== null)
          const orphanedMemberships = memberships.filter(m => m.group === null)
          const orphanedCount = orphanedMemberships.length

          groupMemberships = validMemberships

          // Auto-cleanup orphaned memberships in background
          if (orphanedCount > 0) {
            console.warn(`⚠️ Found ${orphanedCount} orphaned group memberships for client ${id} - cleaning up...`)
            Promise.all(orphanedMemberships.map(m => 
              prisma.clientCompanyGroup.delete({ where: { id: m.id } }).catch(err => 
                console.error(`Failed to delete orphaned membership ${m.id}:`, err.message)
              )
            )).then(() => {
              console.log(`✅ Cleaned up ${orphanedCount} orphaned memberships for client ${id}`)
            }).catch(err => {
              console.error(`❌ Error during orphaned membership cleanup:`, err.message)
            })
          }
        } catch (membershipError) {
          // If query fails, log but continue without group memberships
          console.warn(`⚠️ Failed to load group memberships for client ${id}:`, membershipError.message)
          groupMemberships = []
        }

        // Combine client data with group memberships
        const client = {
          ...clientBasic,
          groupMemberships
        }
        
        // Parse JSON fields (proposals, contacts, etc.)
        const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        const parsedClient = { ...client }
        
        // Parse JSON fields with error handling
        for (const field of jsonFields) {
          try {
            const value = parsedClient[field]
            if (typeof value === 'string' && value) {
              try {
                parsedClient[field] = JSON.parse(value)
              } catch (parseError) {
                // Set safe defaults on parse error
                console.warn(`⚠️ Failed to parse JSON field "${field}" for client ${id}:`, parseError.message)
                parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
              }
            } else if (!value) {
              // Set defaults for missing/null fields
              parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          } catch (fieldError) {
            console.warn(`⚠️ Error processing field "${field}" for client ${id}:`, fieldError.message)
            // Set safe default
            parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
          }
        }
        
        return ok(res, { client: parsedClient })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'getting client')
        
        // Log additional context
        console.error('❌ Error details for client ID:', id)
        console.error('❌ Error code:', dbError.code)
        console.error('❌ Error name:', dbError.name)
        console.error('❌ Error message:', dbError.message)
        console.error('❌ Error meta:', dbError.meta)
        console.error('❌ Full error stack:', dbError.stack?.substring(0, 500))
        
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        // Check for specific Prisma errors
        if (dbError.code === 'P2025') {
          // Record not found
          return notFound(res)
        }
        
        // Check for constraint violations or data corruption
        if (dbError.code === 'P2002' || dbError.code === 'P2003') {
          console.error('❌ Database constraint violation for client:', id)
          return serverError(res, 'Database constraint error', `The client data may be corrupted or have invalid relationships. Error: ${dbError.message}`)
        }
        
        // Provide more detailed error message
        const errorDetails = dbError.meta ? JSON.stringify(dbError.meta) : dbError.message
        return serverError(res, 'Failed to get client', errorDetails || 'Unknown database error')
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

      
      // Log the actual strings being saved
      if (updateData.comments) {
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
            }
          } catch (industryError) {
            // Don't block the client update if industry sync fails
            console.warn('⚠️ Error syncing industry:', industryError.message)
          }
        }
        
        const client = await prisma.client.update({
          where: { id },
          data: updateData
        })
        
        // Log to file
        const fs = await import('fs')
        const afterUpdateLog = `\n=== AFTER UPDATE ===\nClient: ${client.name}\nComments: ${client.comments}\nComments Length: ${client.comments?.length}\n`
        fs.writeFileSync('/tmp/client-update.log', afterUpdateLog, { flag: 'a' })
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== client.name) {
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
        
        return ok(res, { client: parsedClient })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'updating client')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        console.error('❌ Database error updating client:', dbError)
        console.error('❌ Error code:', dbError.code, 'Meta:', dbError.meta)
        return serverError(res, 'Failed to update client', dbError.message)
      }
    }

    // Delete Client (DELETE /api/clients/[id])
    if (req.method === 'DELETE') {
      try {
        // First, delete all related records to avoid foreign key constraints
        
        // Delete opportunities
        const opportunitiesDeleted = await prisma.opportunity.deleteMany({
          where: { clientId: id }
        })
        
        // Delete invoices
        const invoicesDeleted = await prisma.invoice.deleteMany({
          where: { clientId: id }
        })
        
        // Delete sales orders
        const salesOrdersDeleted = await prisma.salesOrder.deleteMany({
          where: { clientId: id }
        })
        
        // Update projects to remove client reference (set clientId to null)
        const projectsUpdated = await prisma.project.updateMany({
          where: { clientId: id },
          data: { clientId: null }
        })
        
        // Update service calls to remove client reference (set clientId to null) if ServiceCall model exists
        let serviceCallsUpdated = { count: 0 }
        try {
          serviceCallsUpdated = await prisma.serviceCall.updateMany({
            where: { clientId: id },
            data: { clientId: null }
          })
        } catch (error) {
          // ServiceCall model might not exist, ignore error
        }
        
        // ClientNews, ClientTag, and StarredClient have onDelete: Cascade, so they'll be deleted automatically
        // Now delete the client
        await prisma.client.delete({ where: { id } })
        return ok(res, { 
          message: `Client deleted successfully. Also deleted ${opportunitiesDeleted.count} opportunities, ${invoicesDeleted.count} invoices, ${salesOrdersDeleted.count} sales orders, and updated ${projectsUpdated.count} projects.`
        })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'deleting client')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        console.error('❌ Database error deleting client:', dbError)
        console.error('❌ Full error details:', JSON.stringify(dbError, null, 2))
        return serverError(res, 'Failed to delete client', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Clients [id] API Error:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack?.substring(0, 1000),
      url: req.url,
      method: req.method,
      id: req.params?.id
    })
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
