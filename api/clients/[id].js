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
        // Use raw SQL query to completely bypass Prisma's relation resolution
        // This avoids the parentGroupId schema mismatch error
        let clientBasic
        try {
          const rawResult = await prisma.$queryRaw`
            SELECT id, name, type, industry, status, stage, revenue, value, probability, 
                   "lastContact", address, website, notes, contacts, "followUps", 
                   "projectIds", comments, sites, contracts, "activityLog", "billingTerms", 
                   proposals, services, "ownerId", "externalAgentId", "createdAt", "updatedAt", 
                   thumbnail, "rssSubscribed"
            FROM "Client"
            WHERE id = ${id}
          `
          clientBasic = rawResult && rawResult[0] ? rawResult[0] : null
        } catch (rawQueryError) {
          console.error(`❌ Raw SQL query failed for client ${id}:`, rawQueryError.message)
          // Fallback to Prisma with explicit select (but this might still fail)
          try {
            clientBasic = await prisma.client.findUnique({ 
              where: { id },
              select: {
                id: true,
                name: true,
                type: true,
                industry: true,
                status: true,
                stage: true,
                revenue: true,
                value: true,
                probability: true,
                lastContact: true,
                address: true,
                website: true,
                notes: true,
                contacts: true,
                followUps: true,
                projectIds: true,
                comments: true,
                sites: true,
                contracts: true,
                activityLog: true,
                billingTerms: true,
                proposals: true,
                services: true,
                ownerId: true,
                externalAgentId: true,
                createdAt: true,
                updatedAt: true,
                thumbnail: true,
                rssSubscribed: true
              }
            })
          } catch (prismaError) {
            console.error(`❌ Both raw SQL and Prisma queries failed for client ${id}`)
            throw prismaError
          }
        }
        
        if (!clientBasic) {
          return notFound(res)
        }

        // Get group memberships separately using raw SQL to avoid Prisma relation issues
        let groupMemberships = []
        try {
          // Query memberships using raw SQL
          const membershipRecords = await prisma.$queryRaw`
            SELECT id, "clientId", "groupId", role, "createdAt"
            FROM "ClientCompanyGroup"
            WHERE "clientId" = ${id}
          `

          // Then fetch groups separately using raw SQL for each membership
          const membershipsWithGroups = await Promise.all(
            membershipRecords.map(async (membership) => {
              try {
                const groupResult = await prisma.$queryRaw`
                  SELECT id, name, type, industry
                  FROM "Client"
                  WHERE id = ${membership.groupId}
                `
                const group = groupResult && groupResult[0] ? groupResult[0] : null
                return {
                  ...membership,
                  group: group
                }
              } catch (groupError) {
                // Group doesn't exist or query failed
                console.warn(`⚠️ Failed to load group ${membership.groupId} for membership ${membership.id}:`, groupError.message)
                return {
                  ...membership,
                  group: null
                }
              }
            })
          )

          // Filter out orphaned memberships (where group is null) and auto-cleanup
          const validMemberships = membershipsWithGroups.filter(m => m.group !== null)
          const orphanedMemberships = membershipsWithGroups.filter(m => m.group === null)
          const orphanedCount = orphanedMemberships.length

          groupMemberships = validMemberships

          // Auto-cleanup orphaned memberships in background using raw SQL
          if (orphanedCount > 0) {
            console.warn(`⚠️ Found ${orphanedCount} orphaned group memberships for client ${id} - cleaning up...`)
            Promise.all(orphanedMemberships.map(m => 
              prisma.$executeRaw`DELETE FROM "ClientCompanyGroup" WHERE id = ${m.id}`.catch(err => 
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
        // Check if name is being updated - fetch current client first using raw SQL
        let oldName = null
        let oldWebsite = null
        if (updateData.name !== undefined) {
          const existingResult = await prisma.$queryRaw`
            SELECT name, website FROM "Client" WHERE id = ${id}
          `
          if (existingResult && existingResult[0]) {
            oldName = existingResult[0].name
            oldWebsite = existingResult[0].website
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
        
        // Use Prisma's update method with explicit select to avoid relation resolution issues
        // First check if there are any fields to update
        if (Object.keys(updateData).length === 0) {
          // No fields to update, just fetch and return current client using raw SQL
          const currentResult = await prisma.$queryRaw`
            SELECT * FROM "Client" WHERE id = ${id}
          `
          if (!currentResult || !currentResult[0]) {
            return notFound(res)
          }
          const client = currentResult[0]
          
          // Parse JSON fields
          const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
          const parsedClient = { ...client }
          for (const field of jsonFields) {
            const value = parsedClient[field]
            if (typeof value === 'string' && value) {
              try {
                parsedClient[field] = JSON.parse(value)
              } catch (e) {
                parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
              }
            } else if (!value) {
              parsedClient[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          }
          return ok(res, { client: parsedClient })
        }
        
        // Use Prisma's update method with explicit select to avoid relation issues
        // This is safer than raw SQL and handles type conversion automatically
        const client = await prisma.client.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            status: true,
            stage: true,
            revenue: true,
            value: true,
            probability: true,
            lastContact: true,
            address: true,
            website: true,
            notes: true,
            contacts: true,
            followUps: true,
            projectIds: true,
            comments: true,
            sites: true,
            contracts: true,
            activityLog: true,
            billingTerms: true,
            proposals: true,
            services: true,
            ownerId: true,
            externalAgentId: true,
            createdAt: true,
            updatedAt: true,
            thumbnail: true,
            rssSubscribed: true
          }
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
        // First check if client exists
        const clientExists = await prisma.$queryRaw`
          SELECT id FROM "Client" WHERE id = ${id} LIMIT 1
        `
        
        if (!clientExists || clientExists.length === 0) {
          return notFound(res)
        }
        
        // Use a transaction to ensure atomicity
        console.log(`🗑️ Starting client deletion for ID: ${id}`)
        const result = await prisma.$transaction(async (tx) => {
          const counts = {
            opportunities: 0,
            invoices: 0,
            salesOrders: 0,
            projects: 0,
            serviceCalls: 0,
            jobCards: 0,
            productionOrders: 0,
            userTasks: 0,
            groupMemberships: 0
          }
          
          try {
            // Delete opportunities
            console.log(`  → Deleting opportunities for client ${id}`)
            counts.opportunities = await tx.opportunity.deleteMany({
              where: { clientId: id }
            }).then(r => r.count)
            console.log(`  ✅ Deleted ${counts.opportunities} opportunities`)
          } catch (error) {
            console.error('❌ Error deleting opportunities:', error)
            console.error('❌ Error details:', {
              message: error.message,
              code: error.code,
              name: error.name,
              meta: error.meta,
              stack: error.stack?.substring(0, 500)
            })
            // Preserve the original error with its code
            const newError = new Error(`Failed to delete opportunities: ${error.message}`)
            newError.code = error.code
            newError.meta = error.meta
            throw newError
          }
          
          try {
            // Delete invoices
            console.log(`  → Deleting invoices for client ${id}`)
            counts.invoices = await tx.invoice.deleteMany({
              where: { clientId: id }
            }).then(r => r.count)
            console.log(`  ✅ Deleted ${counts.invoices} invoices`)
          } catch (error) {
            console.error('❌ Error deleting invoices:', error)
            const newError = new Error(`Failed to delete invoices: ${error.message}`)
            newError.code = error.code
            newError.meta = error.meta
            throw newError
          }
          
          try {
            // Delete sales orders
            console.log(`  → Deleting sales orders for client ${id}`)
            counts.salesOrders = await tx.salesOrder.deleteMany({
              where: { clientId: id }
            }).then(r => r.count)
            console.log(`  ✅ Deleted ${counts.salesOrders} sales orders`)
          } catch (error) {
            console.error('❌ Error deleting sales orders:', error)
            const newError = new Error(`Failed to delete sales orders: ${error.message}`)
            newError.code = error.code
            newError.meta = error.meta
            throw newError
          }
          
          try {
            // Update projects to remove client reference (set clientId to null)
            console.log(`  → Updating projects for client ${id}`)
            counts.projects = await tx.project.updateMany({
              where: { clientId: id },
              data: { clientId: null }
            }).then(r => r.count)
            console.log(`  ✅ Updated ${counts.projects} projects`)
          } catch (error) {
            console.error('❌ Error updating projects:', error)
            const newError = new Error(`Failed to update projects: ${error.message}`)
            newError.code = error.code
            newError.meta = error.meta
            throw newError
          }
          
          // Update service calls to remove client reference (set clientId to null) if ServiceCall model exists
          try {
            counts.serviceCalls = await tx.serviceCall.updateMany({
              where: { clientId: id },
              data: { clientId: null }
            }).then(r => r.count)
          } catch (error) {
            // ServiceCall model might not exist, ignore error
            console.warn('⚠️ ServiceCall model may not exist:', error.message)
          }
          
          // Update JobCards to remove client reference (set clientId to null)
          try {
            counts.jobCards = await tx.jobCard.updateMany({
              where: { clientId: id },
              data: { clientId: null }
            }).then(r => r.count)
          } catch (error) {
            console.warn('⚠️ Error updating job cards:', error.message)
            // Continue with deletion even if job cards update fails
          }
          
          // Update ProductionOrders to remove client reference (set clientId to null)
          try {
            counts.productionOrders = await tx.productionOrder.updateMany({
              where: { clientId: id },
              data: { clientId: null }
            }).then(r => r.count)
          } catch (error) {
            console.warn('⚠️ Error updating production orders:', error.message)
            // Continue with deletion even if production orders update fails
          }
          
          // Update UserTasks to remove client reference (set clientId to null)
          try {
            counts.userTasks = await tx.userTask.updateMany({
              where: { clientId: id },
              data: { clientId: null }
            }).then(r => r.count)
          } catch (error) {
            console.warn('⚠️ Error updating user tasks:', error.message)
            // Continue with deletion even if user tasks update fails
          }
          
          // Delete ClientCompanyGroup records where this client is a member (clientId) or a group (groupId)
          // This must be done before deleting the client to avoid foreign key constraint errors
          // Use raw SQL to avoid Prisma relation resolution issues
          try {
            console.log(`  → Deleting group memberships for client ${id}`)
            // Delete where client is a member using raw SQL
            const asMemberResult = await tx.$executeRaw`
              DELETE FROM "ClientCompanyGroup" WHERE "clientId" = ${id}
            `
            // Delete where client is a group using raw SQL
            const asGroupResult = await tx.$executeRaw`
              DELETE FROM "ClientCompanyGroup" WHERE "groupId" = ${id}
            `
            // Note: $executeRaw returns the number of affected rows
            counts.groupMemberships = (asMemberResult || 0) + (asGroupResult || 0)
            console.log(`  ✅ Deleted ${counts.groupMemberships} group memberships`)
          } catch (groupError) {
            console.error('❌ Error deleting group memberships:', groupError)
            console.error('❌ Group error details:', {
              message: groupError.message,
              code: groupError.code,
              name: groupError.name,
              meta: groupError.meta
            })
            // Try to continue - if the records don't exist, that's fine
            // But if there's a real constraint issue, the client delete will fail anyway
            console.warn('⚠️ Continuing with client deletion despite group membership deletion error')
          }
          
          // ClientNews, StarredClient have onDelete: Cascade, so they'll be deleted automatically
          // Now delete the client using raw SQL to avoid Prisma relation resolution issues
          console.log(`  → Deleting client ${id}`)
          const deleteResult = await tx.$executeRaw`
            DELETE FROM "Client" WHERE id = ${id}
          `
          
          if (deleteResult === 0) {
            throw new Error('Client not found or already deleted')
          }
          console.log(`  ✅ Client deleted successfully`)
          
          return counts
        }, {
          timeout: 30000, // 30 second timeout for the transaction
          maxWait: 10000  // 10 second max wait to acquire lock
        })
        
        console.log(`✅ Client deletion completed successfully for ID: ${id}`)
        return ok(res, { 
          message: `Client deleted successfully. Also deleted ${result.opportunities} opportunities, ${result.invoices} invoices, ${result.salesOrders} sales orders, ${result.groupMemberships} group memberships, and updated ${result.projects} projects, ${result.jobCards} job cards, ${result.productionOrders} production orders, and ${result.userTasks} user tasks.`,
          details: result
        })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'deleting client')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        // Enhanced error logging - log everything to help debug
        console.error('❌ Database error deleting client:', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          name: dbError.name,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 1000),
          clientId: id
        })
        
        // Check for specific error codes
        if (dbError.code === 'P2025') {
          // Record not found
          return notFound(res)
        }
        
        if (dbError.code === 'P2003') {
          // Foreign key constraint failed
          console.error('❌ Foreign key constraint violation - client may have remaining references')
          return serverError(res, 'Cannot delete client', 'This client is still referenced by other records. Please remove all related data first.')
        }
        
        // Check for transaction timeout
        if (dbError.message && dbError.message.includes('timeout')) {
          console.error('❌ Transaction timed out during client deletion')
          return serverError(res, 'Delete operation timed out', 'The deletion took too long. Please try again or contact support if the problem persists.')
        }
        
        // Provide detailed error message to help with debugging
        const errorMessage = dbError.message || 'Unknown error occurred while deleting client'
        const errorDetails = {
          error: errorMessage,
          code: dbError.code || 'UNKNOWN',
          clientId: id,
          timestamp: new Date().toISOString()
        }
        
        // Log full error for server-side debugging
        console.error('❌ Full error object:', JSON.stringify(errorDetails, null, 2))
        
        return serverError(res, 'Failed to delete client', errorMessage)
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
