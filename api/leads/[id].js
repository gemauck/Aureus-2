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
    console.log(`📥 [LEADS ID] ${req.method} ${req.url} - Starting handler`)
    
    // Extract ID from req.params (set by server routing) or fallback to URL parsing
    let id = req.params?.id
    if (!id) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const pathSegments = url.pathname.split('/').filter(Boolean)
      id = pathSegments[pathSegments.length - 1] // Get the ID from the URL
    }

    console.log(`🔍 [LEADS ID] Extracted ID: ${id}`)

        if (!id) {
      console.error('❌ [LEADS ID] No ID provided in request')
      return badRequest(res, 'Lead ID required')
    }

    // Validate ID format (should be a non-empty string)
    if (typeof id !== 'string' || id.trim().length === 0) {
      console.error('❌ [LEADS ID] Invalid ID format:', id)
      return badRequest(res, 'Invalid lead ID format')
    }

    // Get Single Lead (GET /api/leads/[id])
    if (req.method === 'GET') {
      try {
        console.log(`🔍 [LEADS ID] GET request for lead ID: ${id}`)
        console.log(`🔍 [LEADS ID] User ID from request: ${req.user?.sub || 'none'}`)
        console.log(`🔍 [LEADS ID] Request URL: ${req.url}`)
        console.log(`🔍 [LEADS ID] Request method: ${req.method}`)
        console.log(`🔍 [LEADS ID] Request params:`, JSON.stringify(req.params || {}))
        
        // Verify Prisma is available
        if (!prisma) {
          console.error('❌ [LEADS ID] Prisma client is not available')
          return serverError(res, 'Database client not available', 'Prisma client initialization failed')
        }
        
        const userId = req.user?.sub
        let validUserId = null
        if (userId) {
          try {
            console.log(`🔍 [LEADS ID] Checking user existence for ID: ${userId}`)
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
            if (userExists) {
              validUserId = userId
              console.log(`✅ [LEADS ID] User ${userId} validated`)
            } else {
              console.warn(`⚠️ [LEADS ID] User ${userId} not found in database`)
            }
          } catch (userCheckError) {
            // User doesn't exist, skip starredBy relation
            console.error(`❌ [LEADS ID] User check failed for starredBy relation:`, userCheckError)
            console.error(`❌ [LEADS ID] User check error details:`, {
              message: userCheckError.message,
              code: userCheckError.code,
              name: userCheckError.name,
              stack: userCheckError.stack
            })
          }
        } else {
          console.log(`ℹ️ [LEADS ID] No user ID provided, skipping starredBy relation`)
        }
        
        // Build include object with error handling for relations
        const includeObj = {
          externalAgent: true
        }
        
        if (validUserId) {
          includeObj.starredBy = {
            where: {
              userId: validUserId
            },
            select: {
              id: true,
              userId: true
            }
          }
        }
        
        let lead
        try {
          console.log(`🔍 [LEADS ID] Attempting to query lead with ID: ${id}`)
          console.log(`🔍 [LEADS ID] Include object:`, JSON.stringify(Object.keys(includeObj)))
          lead = await prisma.client.findFirst({ 
            where: { id, type: 'lead' },
            include: includeObj
          })
          console.log(`🔍 [LEADS ID] Query result: ${lead ? 'Found' : 'Not found'}`)
        } catch (relationError) {
          console.error(`❌ [LEADS ID] Initial query failed with error:`, relationError.message)
          console.error(`❌ [LEADS ID] Error code:`, relationError.code)
          console.error(`❌ [LEADS ID] Error name:`, relationError.name)
          
          // Check for missing relation errors (externalAgent, etc.)
          const isMissingColumnError = relationError.code === 'P2022' || 
                                     relationError.code === 'P2019' ||
                                     relationError.message?.includes('externalAgentId') ||
                                     relationError.message?.includes('does not exist') ||
                                     relationError.message?.includes('Unknown argument')
          
          if (isMissingColumnError) {
            // Try query without problematic relations (externalAgent)
            console.warn(`⚠️ Relation error detected for lead ${id}, trying without externalAgent relation`)
            console.warn(`⚠️ Error details: ${relationError.message}`)
            try {
              // Try with only starredBy (if user is valid) and no externalAgent
              const fallbackInclude = {
                ...(validUserId ? {
                  starredBy: {
                    where: {
                      userId: validUserId
                    },
                    select: {
                      id: true,
                      userId: true
                    }
                  }
                } : {})
              }
              
              lead = await prisma.client.findFirst({ 
                where: { id, type: 'lead' },
                include: fallbackInclude
              })
              if (lead) {
                // Manually set null externalAgent
                lead.externalAgent = null
                if (!lead.starredBy) {
                  lead.starredBy = []
                }
              }
            } catch (fallbackError) {
              // Try without any relations as last resort
              console.warn(`⚠️ Fallback query failed for lead ${id}, trying minimal query:`, fallbackError.message)
              try {
                lead = await prisma.client.findFirst({ 
                  where: { id, type: 'lead' }
                })
                if (lead) {
                  // Manually set empty/null relations
                  lead.externalAgent = null
                  lead.starredBy = []
                }
              } catch (minimalError) {
                // Re-throw the original error if all fallbacks fail
                console.error(`❌ [LEADS ID] All query fallbacks failed for lead ${id}`)
                console.error(`❌ [LEADS ID] Minimal query error:`, {
                  message: minimalError.message,
                  code: minimalError.code,
                  name: minimalError.name,
                  stack: minimalError.stack
                })
                console.error(`❌ [LEADS ID] Original relation error:`, {
                  message: relationError.message,
                  code: relationError.code,
                  name: relationError.name
                })
                throw relationError
              }
            }
          } else {
            // For other relation errors, try without relations as fallback
            console.warn(`⚠️ [LEADS ID] Query with relations failed for lead ${id}, trying without relations:`, relationError.message)
            try {
              lead = await prisma.client.findFirst({ 
                where: { id, type: 'lead' }
              })
              if (lead) {
                // Manually set empty/null relations
                lead.externalAgent = null
                lead.starredBy = []
                console.log(`✅ [LEADS ID] Successfully retrieved lead ${id} without relations`)
              } else {
                console.warn(`⚠️ [LEADS ID] Lead ${id} not found even without relations`)
              }
            } catch (fallbackError) {
              // Re-throw the original error if fallback also fails
              console.error(`❌ [LEADS ID] Fallback query failed for lead ${id}:`, fallbackError.message)
              console.error(`❌ [LEADS ID] Fallback error details:`, {
                message: fallbackError.message,
                code: fallbackError.code,
                name: fallbackError.name,
                stack: fallbackError.stack
              })
              console.error(`❌ [LEADS ID] Original relation error:`, {
                message: relationError.message,
                code: relationError.code,
                name: relationError.name
              })
              throw relationError
            }
          }
        }
        
        if (!lead) {
          // Check if client exists but is not a lead (for debugging)
          try {
            const client = await prisma.client.findUnique({ 
              where: { id },
              select: { id: true, type: true, name: true }
            })
            if (client) {
              console.warn(`⚠️ Client found but is not a lead: ${id}, type: ${client.type || 'null'}, name: ${client.name || 'N/A'}`)
            } else {
              console.warn(`⚠️ Lead not found: ${id} (client does not exist)`)
            }
          } catch (checkError) {
            console.warn(`⚠️ Lead not found: ${id} (error checking existence: ${checkError.message})`)
          }
          return notFound(res)
        }
        
        // Parse JSON fields (proposals, contacts, etc.)
        const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        const parsedLead = { ...lead }
        
        // Parse JSON fields with error handling
        for (const field of jsonFields) {
          try {
            const value = parsedLead[field]
            if (typeof value === 'string' && value) {
              try {
                parsedLead[field] = JSON.parse(value)
              } catch (parseError) {
                // Set safe defaults on parse error
                console.warn(`⚠️ Failed to parse JSON field "${field}" for lead ${id}:`, parseError.message)
                parsedLead[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
              }
            } else if (!value) {
              // Set defaults for missing/null fields
              parsedLead[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          } catch (fieldError) {
            console.warn(`⚠️ Error processing field "${field}" for lead ${id}:`, fieldError.message)
            // Set safe default
            parsedLead[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
          }
        }
        
        // Check if current user has starred this lead
        try {
          parsedLead.isStarred = validUserId && lead.starredBy && Array.isArray(lead.starredBy) && lead.starredBy.length > 0
        } catch (starError) {
          console.warn(`⚠️ Error checking starred status for lead ${id}:`, starError.message)
          parsedLead.isStarred = false
        }
        
        console.log(`✅ [LEADS ID] Successfully retrieved lead ${id}`)
        return ok(res, { lead: parsedLead })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'getting lead')
        
        // Log additional context with full error details
        console.error('❌ [LEADS ID] Error details for lead ID:', id)
        console.error('❌ [LEADS ID] Error code:', dbError.code)
        console.error('❌ [LEADS ID] Error name:', dbError.name)
        console.error('❌ [LEADS ID] Error message:', dbError.message)
        console.error('❌ [LEADS ID] Error meta:', dbError.meta)
        console.error('❌ [LEADS ID] Error stack:', dbError.stack)
        
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        
        // Check for specific Prisma errors
        if (dbError.code === 'P2025') {
          // Record not found
          return notFound(res)
        }
        
        // Provide more detailed error message with full error information
        const errorDetails = dbError.meta 
          ? `Error code: ${dbError.code || 'UNKNOWN'}, Error name: ${dbError.name || 'Error'}, Meta: ${JSON.stringify(dbError.meta)}, Message: ${dbError.message || 'Unknown error'}`
          : `Error code: ${dbError.code || 'UNKNOWN'}, Error name: ${dbError.name || 'Error'}, Message: ${dbError.message || 'Unknown database error'}`
        
        console.error('❌ [LEADS ID] Returning error response with details:', errorDetails)
        return serverError(res, 'Failed to get lead', errorDetails)
      }
    }

    // Update Lead (PATCH /api/leads/[id])
    if (req.method === 'PATCH') {
      const body = req.body || await parseJsonBody(req)
      
      const updateData = {
        name: body.name,
        industry: body.industry,
        status: body.status,
        stage: body.stage,
        revenue: body.revenue !== undefined ? parseFloat(body.revenue) || 0 : undefined,
        value: body.value !== undefined ? parseFloat(body.value) || 0 : undefined,
        probability: body.probability !== undefined ? parseInt(body.probability) || 0 : undefined,
        lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
        address: body.address,
        website: body.website,
        notes: body.notes !== undefined ? String(body.notes || '') : undefined,
        contacts: body.contacts !== undefined ? (typeof body.contacts === 'string' ? body.contacts : JSON.stringify(Array.isArray(body.contacts) ? body.contacts : [])) : undefined,
        followUps: body.followUps !== undefined ? (typeof body.followUps === 'string' ? body.followUps : JSON.stringify(Array.isArray(body.followUps) ? body.followUps : [])) : undefined,
        projectIds: body.projectIds !== undefined ? (typeof body.projectIds === 'string' ? body.projectIds : JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : [])) : undefined,
        comments: body.comments !== undefined ? (typeof body.comments === 'string' ? body.comments : JSON.stringify(Array.isArray(body.comments) ? body.comments : [])) : undefined,
        sites: body.sites !== undefined ? (typeof body.sites === 'string' ? body.sites : JSON.stringify(Array.isArray(body.sites) ? body.sites : [])) : undefined,
        contracts: body.contracts !== undefined ? (typeof body.contracts === 'string' ? body.contracts : JSON.stringify(Array.isArray(body.contracts) ? body.contracts : [])) : undefined,
        activityLog: body.activityLog !== undefined ? (typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : [])) : undefined,
        billingTerms: body.billingTerms !== undefined ? (typeof body.billingTerms === 'string' ? body.billingTerms : JSON.stringify(body.billingTerms)) : undefined,
        proposals: body.proposals !== undefined ? (typeof body.proposals === 'string' ? body.proposals : JSON.stringify(Array.isArray(body.proposals) ? body.proposals : [])) : undefined,
        services: body.services !== undefined ? (typeof body.services === 'string' ? body.services : JSON.stringify(Array.isArray(body.services) ? body.services : [])) : undefined,
        externalAgentId: body.externalAgentId !== undefined ? (body.externalAgentId || null) : undefined
      }

      // Remove undefined values (but keep empty strings and empty arrays as JSON strings)
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      
      try {
        // First verify the lead exists
        const existing = await prisma.client.findUnique({ where: { id } })
        if (!existing) {
          console.error('❌ Lead not found:', id)
          return notFound(res)
        }
        if (existing.type !== 'lead') {
          console.error('❌ Record is not a lead:', id, 'type:', existing.type)
          return badRequest(res, 'Not a lead')
        }
        
        // Store old name and website for RSS feed update
        const oldName = existing.name
        const oldWebsite = existing.website
        
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
            // Don't block the lead update if industry sync fails
            console.warn('⚠️ Error syncing industry:', industryError.message)
          }
        }
        
        // Now update it
        const lead = await prisma.client.update({
          where: { id },
          data: updateData
        })
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== lead.name) {
          // Trigger RSS search asynchronously (don't block the response)
          searchAndSaveNewsForClient(lead.id, lead.name, lead.website || oldWebsite || '').catch(error => {
            console.error('❌ Error updating RSS feed after name change:', error)
          })
        }
        
        // Parse JSON fields before returning
        const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        const parsedLead = { ...lead }
        
        for (const field of jsonFields) {
          const value = parsedLead[field]
          if (typeof value === 'string' && value) {
            try {
              parsedLead[field] = JSON.parse(value)
            } catch (e) {
              parsedLead[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
            }
          } else if (!value) {
            parsedLead[field] = field === 'billingTerms' ? { paymentTerms: 'Net 30', billingFrequency: 'Monthly', currency: 'ZAR', retainerAmount: 0, taxExempt: false, notes: '' } : []
          }
        }
        
        return ok(res, { lead: parsedLead })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'updating lead')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        console.error('❌ Database error updating lead:', dbError)
        console.error('❌ Error code:', dbError.code, 'Meta:', dbError.meta)
        return serverError(res, 'Failed to update lead', dbError.message)
      }
    }

    // Delete Lead (DELETE /api/leads/[id])
    if (req.method === 'DELETE') {
      try {
        // Verify it's a lead before deleting
        const existing = await prisma.client.findUnique({ where: { id } })
        if (!existing || existing.type !== 'lead') {
          return notFound(res)
        }
        
        await prisma.client.delete({ 
          where: { id } 
        })
        return ok(res, { message: 'Lead deleted successfully' })
      } catch (dbError) {
        const isConnError = logDatabaseError(dbError, 'deleting lead')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        console.error('❌ Database error deleting lead:', dbError)
        return serverError(res, 'Failed to delete lead', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ [LEADS ID] Unhandled error in leads [id] API:', error)
    console.error('❌ [LEADS ID] Error stack:', error.stack)
    console.error('❌ [LEADS ID] Error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      meta: error.meta,
      url: req.url,
      method: req.method,
      id: req.params?.id
    })
    
    // Provide detailed error information
    const errorDetails = error.meta 
      ? `Unhandled error: ${error.name || 'Error'} (${error.code || 'UNKNOWN'}), Message: ${error.message || 'Unknown error'}, Meta: ${JSON.stringify(error.meta)}`
      : `Unhandled error: ${error.name || 'Error'} (${error.code || 'UNKNOWN'}), Message: ${error.message || 'Unknown error'}`
    
    return serverError(res, 'Internal server error', errorDetails)
  }
}

export default withHttp(withLogging(authRequired(handler)))
