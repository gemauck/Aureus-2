import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { searchAndSaveNewsForClient } from '../client-news/search.js'
import { logDatabaseError, isConnectionError } from '../_lib/dbErrorHandler.js'
import { parseClientJsonFields, prepareJsonFieldsForDualWrite } from '../_lib/clientJsonFields.js'

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
        
        // Phase 3: Get lead with normalized tables, JSONB, and String fallback
        let lead
        try {
          console.log(`🔍 [LEADS ID] Attempting to query lead with ID: ${id}`)
          
          // Try to get lead with normalized relations first
          try {
            lead = await prisma.client.findFirst({ 
              where: { id, type: 'lead' },
              include: {
                clientContacts: true,
                clientComments: true,
                clientSites: true,
                clientContracts: true,
                clientProposals: true,
                clientFollowUps: true,
                clientServices: true,
                projects: { select: { id: true, name: true, status: true } },
                ...(includeObj.externalAgent ? { externalAgent: true } : {}),
                ...(includeObj.starredBy ? { starredBy: includeObj.starredBy } : {})
              }
            })
            
            if (lead) {
              console.log(`✅ [LEADS ID] Successfully retrieved lead ${id} with relations`)
            }
          } catch (prismaError) {
            console.warn(`⚠️ [LEADS ID] Prisma query with relations failed, trying raw SQL:`, prismaError.message)
            // Fallback to raw SQL
            const rawResult = await prisma.$queryRaw`
              SELECT id, name, type, industry, status, stage, revenue, value, probability, 
                     "lastContact", address, website, notes, contacts, "followUps", 
                     "projectIds", comments, sites, contracts, "activityLog", "billingTerms", 
                     proposals, services, "ownerId", "externalAgentId", "createdAt", "updatedAt", 
                     thumbnail, "rssSubscribed", kyc
              FROM "Client"
              WHERE id = ${id} AND type = 'lead'
            `
            lead = rawResult && rawResult[0] ? rawResult[0] : null
            
            if (lead) {
              // Manually set relations to null/empty
              lead.externalAgent = null
              lead.starredBy = []
              lead.clientContacts = []
              lead.clientComments = []
              lead.clientSites = []
              lead.clientContracts = []
              lead.clientProposals = []
              lead.clientFollowUps = []
              lead.clientServices = []
              lead.projects = []
              
              // Try to fetch normalized data separately
              try {
                const contactsResult = await prisma.$queryRaw`
                  SELECT id, "clientId", name, email, phone, mobile, role, title, "isPrimary", notes, "createdAt"
                  FROM "ClientContact"
                  WHERE "clientId" = ${id}
                  ORDER BY "isPrimary" DESC, "createdAt" ASC
                `
                lead.clientContacts = contactsResult || []
                
                const commentsResult = await prisma.$queryRaw`
                  SELECT id, "clientId", text, "authorId", author, "userName", "createdAt"
                  FROM "ClientComment"
                  WHERE "clientId" = ${id}
                  ORDER BY "createdAt" DESC
                `
                lead.clientComments = commentsResult || []
                
                // Phase 6: Fetch normalized tables (include siteLead, stage, aidaStatus for per-site lead tracking)
                const sitesResult = await prisma.$queryRaw`
                  SELECT id, "clientId", name, address, "contactPerson", "contactPhone", "contactEmail", notes,
                         "siteLead", "stage", "aidaStatus", "createdAt", "updatedAt"
                  FROM "ClientSite"
                  WHERE "clientId" = ${id}
                  ORDER BY "createdAt" ASC
                `
                lead.clientSites = sitesResult || []
                
                const contractsResult = await prisma.$queryRaw`
                  SELECT id, "clientId", name, size, type, "uploadDate", url, "createdAt"
                  FROM "ClientContract"
                  WHERE "clientId" = ${id}
                  ORDER BY "uploadDate" DESC
                `
                lead.clientContracts = contractsResult || []
                
                const proposalsResult = await prisma.$queryRaw`
                  SELECT id, "clientId", title, amount, status, "workingDocumentLink", "createdDate", "expiryDate", notes, "createdAt"
                  FROM "ClientProposal"
                  WHERE "clientId" = ${id}
                  ORDER BY "createdDate" DESC
                `
                lead.clientProposals = proposalsResult || []
                
                const followUpsResult = await prisma.$queryRaw`
                  SELECT id, "clientId", date, time, type, description, completed, "assignedTo", "createdAt"
                  FROM "ClientFollowUp"
                  WHERE "clientId" = ${id}
                  ORDER BY date ASC, time ASC
                `
                lead.clientFollowUps = followUpsResult || []
                
                const servicesResult = await prisma.$queryRaw`
                  SELECT id, "clientId", name, description, price, status, "startDate", "endDate", notes, "createdAt"
                  FROM "ClientService"
                  WHERE "clientId" = ${id}
                  ORDER BY "startDate" DESC
                `
                lead.clientServices = servicesResult || []
                
                const projectsResult = await prisma.$queryRaw`
                  SELECT id, name, status
                  FROM "Project"
                  WHERE "clientId" = ${id}
                  ORDER BY "createdAt" DESC
                `
                lead.projects = projectsResult || []
              } catch (normError) {
                console.warn(`⚠️ Could not fetch normalized data:`, normError.message)
              }
              
              console.log(`✅ [LEADS ID] Successfully retrieved lead ${id} using raw SQL`)
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
          
          // Phase 3: Use shared parseClientJsonFields which handles normalized tables, JSONB, and String fallback
          const parsedLead = parseClientJsonFields(lead)
          
          // Check if current user has starred this lead
          try {
            parsedLead.isStarred = validUserId && lead.starredBy && Array.isArray(lead.starredBy) && lead.starredBy.length > 0
          } catch (starError) {
            console.warn(`⚠️ Error checking starred status for lead ${id}:`, starError.message)
            parsedLead.isStarred = false
          }
          
          // Set external agent if available
          if (lead.externalAgent) {
            parsedLead.externalAgent = lead.externalAgent
          }
          
          console.log(`✅ [LEADS ID] Successfully retrieved lead ${id}`)
          return ok(res, { lead: parsedLead })
        } catch (queryError) {
          // Handle errors from the lead query try block
          throw queryError
        }
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
    // ⚠️ DEPRECATED ENDPOINT: This endpoint is deprecated. Use /api/leads (PATCH) instead.
    if (req.method === 'PATCH') {
      let body = req.body
      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }
      if (!body) body = {}
      
      console.warn(`⚠️ DEPRECATED: PATCH /api/leads/[id] endpoint used for lead ${id}. Use /api/leads (PATCH) instead.`)
      
      // Build updateData - only include fields that are actually provided in body
      const updateData = {}
      
      // Basic fields - only include if provided in body
      if (body.name !== undefined) updateData.name = body.name
      if (body.industry !== undefined) updateData.industry = body.industry
      if (body.status !== undefined) updateData.status = body.status
      if (body.stage !== undefined) updateData.stage = body.stage
      if (body.revenue !== undefined) updateData.revenue = parseFloat(body.revenue) || 0
      if (body.value !== undefined) updateData.value = parseFloat(body.value) || 0
      if (body.probability !== undefined) updateData.probability = parseInt(body.probability) || 0
      if (body.lastContact !== undefined) {
        updateData.lastContact = body.lastContact ? new Date(body.lastContact) : null
      }
      if (body.address !== undefined) updateData.address = body.address
      if (body.website !== undefined) updateData.website = body.website
      // Always include notes if provided (even if empty string) to allow clearing notes
      if (body.notes !== undefined) {
        updateData.notes = body.notes !== null && body.notes !== undefined ? String(body.notes) : ''
      }
      
      // External agent - include even if null (to allow clearing)
      if (body.externalAgentId !== undefined) {
        updateData.externalAgentId = body.externalAgentId || null
      }
      
      // JSON fields - only include if provided
      if (body.projectIds !== undefined) {
        updateData.projectIds = typeof body.projectIds === 'string' 
          ? body.projectIds 
          : JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : [])
      }
      if (body.activityLog !== undefined) {
        updateData.activityLog = typeof body.activityLog === 'string' 
          ? body.activityLog 
          : JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : [])
      }
      if (body.billingTerms !== undefined) {
        updateData.billingTerms = typeof body.billingTerms === 'string' 
          ? body.billingTerms 
          : JSON.stringify(body.billingTerms)
      }
      if (body.kyc !== undefined) {
        const kycDual = prepareJsonFieldsForDualWrite({ kyc: body.kyc })
        if (kycDual.kyc !== undefined) updateData.kyc = kycDual.kyc
        if (kycDual.kycJsonb !== undefined) updateData.kycJsonb = kycDual.kycJsonb
      }
      // CRITICAL: Update comments JSON field in Client table
      if (body.comments !== undefined) {
        updateData.comments = typeof body.comments === 'string' 
          ? body.comments 
          : JSON.stringify(Array.isArray(body.comments) ? body.comments : [])
        console.log(`📝 [LEADS ID] Updating comments JSON field for lead ${id}, count: ${Array.isArray(body.comments) ? body.comments.length : 0}`)
      }
      // CRITICAL: Update followUps JSON field in Client table
      if (body.followUps !== undefined) {
        updateData.followUps = typeof body.followUps === 'string' 
          ? body.followUps 
          : JSON.stringify(Array.isArray(body.followUps) ? body.followUps : [])
        console.log(`📝 [LEADS ID] Updating followUps JSON field for lead ${id}, count: ${Array.isArray(body.followUps) ? body.followUps.length : 0}`)
      }
      
      // CRITICAL: Preserve lead type - always set type to 'lead' to prevent accidental conversion
      updateData.type = 'lead'
      
      // Debug logging to verify updateData is constructed correctly
      console.log(`📝 [LEADS ID] Update data for lead ${id}:`, JSON.stringify(updateData, null, 2))
      console.log(`📝 [LEADS ID] Fields in body:`, Object.keys(body || {}))
      
      // Check if updateData is empty (only has type) - but do NOT early-return if body has
      // sites/contacts/groupIds etc. (handled in phases below); otherwise site/contact/group
      // updates from the list would never persist.
      const hasPhaseOnlyUpdates = body.sites !== undefined || body.contacts !== undefined ||
        body.groupIds !== undefined || body.contracts !== undefined || body.proposals !== undefined ||
        body.followUps !== undefined || body.services !== undefined
      if (Object.keys(updateData).length === 1 && updateData.type && !hasPhaseOnlyUpdates) {
        console.warn(`⚠️ [LEADS ID] Update data is empty (only type field) - no fields to update for lead ${id}`)
        // Return the existing lead without updating
        const existing = await prisma.client.findUnique({ 
          where: { id },
          include: {
            clientContacts: true,
            clientComments: true,
            clientSites: true,
            clientContracts: true,
            clientProposals: true,
            clientFollowUps: true,
            clientServices: true,
            projects: { select: { id: true, name: true, status: true } },
            externalAgent: true,
            // CRITICAL: Include groupMemberships to ensure they're returned in response
            groupMemberships: {
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
            }
          }
        })
        if (!existing) {
          return notFound(res)
        }
        const parsedLead = parseClientJsonFields(existing)
        return ok(res, { lead: parsedLead })
      }
      
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
        
        // Phase 5: Handle contacts separately to sync to normalized table
        if (body.contacts !== undefined) {
          let contactsArray = []
          if (Array.isArray(body.contacts)) {
            contactsArray = body.contacts
          } else if (typeof body.contacts === 'string' && body.contacts.trim()) {
            try {
              contactsArray = JSON.parse(body.contacts)
            } catch (e) {
              contactsArray = []
            }
          }
          console.log(`📝 [LEADS ID] Processing ${contactsArray.length} contacts for lead ${id}`)
          
          try {
            // Get existing contacts to compare
            const existingContacts = await prisma.clientContact.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            // Convert all IDs to strings for consistent comparison
            const existingContactIds = new Set(existingContacts.map(c => String(c.id)))
            const contactsToKeep = new Set()
            
            // Process each contact with individual create/update to handle custom IDs properly
            for (const contact of contactsArray) {
              // Convert contact ID to string for consistency with Prisma (which uses string IDs)
              const contactId = contact.id ? String(contact.id) : null
              
              const contactData = {
                clientId: id,
                name: contact.name || '',
                email: contact.email || null,
                phone: contact.phone || null,
                mobile: contact.mobile || contact.phone || null,
                role: contact.role || null,
                title: contact.title || contact.department || null,
                isPrimary: !!contact.isPrimary,
                notes: contact.notes || ''
              }
              
              // Use individual create/update to support custom IDs (createMany doesn't support custom IDs)
              if (contactId && existingContactIds.has(contactId)) {
                // Update existing contact
                await prisma.clientContact.update({
                  where: { id: contactId },
                  data: contactData
                })
                contactsToKeep.add(contactId)
              } else if (contactId) {
                // Create with specific ID (converted to string)
                try {
                  await prisma.clientContact.create({
                    data: {
                      id: contactId,
                      ...contactData
                    }
                  })
                  contactsToKeep.add(contactId)
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientContact.update({
                      where: { id: contactId },
                      data: contactData
                    })
                    contactsToKeep.add(contactId)
                  } else {
                    throw createError
                  }
                }
              } else {
                // Create without ID (Prisma generates one)
                const created = await prisma.clientContact.create({
                  data: contactData
                })
                contactsToKeep.add(String(created.id))
              }
            }
            
            // Delete contacts that are no longer in the array
            await prisma.clientContact.deleteMany({
              where: {
                clientId: id,
                NOT: {
                  id: { in: Array.from(contactsToKeep) }
                }
              }
            })
            console.log(`✅ Successfully synced ${contactsArray.length} contacts to normalized table for lead ${id}`)
          } catch (contactSyncError) {
            console.error('❌ Failed to sync contacts to normalized table:', contactSyncError)
            console.error('❌ Contact sync error details:', {
              message: contactSyncError.message,
              code: contactSyncError.code,
              stack: contactSyncError.stack
            })
            // Don't throw - allow lead update to succeed even if contact sync fails
          }
        }
        
        // Phase 5: Handle comments separately to sync to normalized table
        if (body.comments !== undefined) {
          let commentsArray = []
          if (Array.isArray(body.comments)) {
            commentsArray = body.comments
          } else if (typeof body.comments === 'string' && body.comments.trim()) {
            try {
              commentsArray = JSON.parse(body.comments)
            } catch (e) {
              console.error('❌ [LEADS ID] Failed to parse comments JSON:', e.message)
              commentsArray = []
            }
          }
          
          console.log(`📝 [LEADS ID] Processing ${commentsArray.length} comments for lead ${id}`)
          
          try {
            const userId = req.user?.sub || null
            let authorName = ''
            let userName = ''
            
            if (userId) {
              try {
                const user = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { name: true, email: true }
                })
                if (user) {
                  authorName = user.name || ''
                  userName = user.email || ''
                }
              } catch (userError) {
                console.warn('⚠️ [LEADS ID] User lookup failed:', userError.message)
              }
            }
            
            const existingComments = await prisma.clientComment.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingCommentIds = new Set(existingComments.map(c => c.id))
            const commentsToKeep = new Set()
            
            for (const comment of commentsArray) {
              // Map frontend field names (createdBy/createdById/createdByEmail) to database fields (author/authorId/userName)
              // Support both naming conventions for backward compatibility
              const commentData = {
                clientId: id,
                text: comment.text || '',
                authorId: comment.authorId || comment.createdById || userId || null,
                author: comment.author || comment.createdBy || authorName || '',
                userName: comment.userName || comment.createdByEmail || userName || null,
                createdAt: comment.createdAt ? new Date(comment.createdAt) : undefined
              }
              
              if (comment.id && existingCommentIds.has(comment.id)) {
                await prisma.clientComment.update({
                  where: { id: comment.id },
                  data: commentData
                })
                commentsToKeep.add(comment.id)
                console.log(`✅ [LEADS ID] Updated comment ${comment.id} for lead ${id}`)
              } else if (comment.id) {
                try {
                  await prisma.clientComment.create({
                    data: { id: comment.id, ...commentData }
                  })
                  commentsToKeep.add(comment.id)
                  console.log(`✅ [LEADS ID] Created comment ${comment.id} for lead ${id}`)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientComment.update({
                      where: { id: comment.id },
                      data: commentData
                    })
                    commentsToKeep.add(comment.id)
                    console.log(`✅ [LEADS ID] Updated comment ${comment.id} after ID conflict for lead ${id}`)
                  } else {
                    console.error(`❌ [LEADS ID] Failed to create comment ${comment.id}:`, createError.message)
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientComment.create({ data: commentData })
                commentsToKeep.add(created.id)
                console.log(`✅ [LEADS ID] Created new comment ${created.id} for lead ${id}`)
              }
            }
            
            await prisma.clientComment.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(commentsToKeep) } }
              }
            })
            
            console.log(`✅ [LEADS ID] Successfully synced ${commentsArray.length} comments to normalized table for lead ${id}`)
          } catch (commentSyncError) {
            console.error('❌ [LEADS ID] Failed to sync comments to normalized table:', commentSyncError.message)
            console.error('❌ [LEADS ID] Comment sync error details:', {
              message: commentSyncError.message,
              code: commentSyncError.code,
              stack: commentSyncError.stack
            })
            // Don't throw - allow lead update to succeed even if comment sync fails
            // The JSON field will still be updated above
          }
        }
        
        // Phase 6: Handle normalized fields separately (sites, contracts, proposals, followUps, services)
        // Sites
        if (body.sites !== undefined) {
          let sitesArray = []
          if (Array.isArray(body.sites)) {
            sitesArray = body.sites
          } else if (typeof body.sites === 'string' && body.sites.trim()) {
            try {
              sitesArray = JSON.parse(body.sites)
            } catch (e) {
              sitesArray = []
            }
          }
          console.log(`📝 [LEADS ID] Syncing ${sitesArray.length} site(s) for lead ${id}`)
          
          try {
            const existingSites = await prisma.clientSite.findMany({
              where: { clientId: id },
              select: { id: true },
              orderBy: { id: 'asc' }
            })
            const existingSiteIds = new Set(existingSites.map(s => s.id))
            const sitesToKeep = new Set()
            
            for (let idx = 0; idx < sitesArray.length; idx++) {
              const site = sitesArray[idx]
              // Use defaults for stage/aidaStatus so we never overwrite with empty (persistence after refresh)
              const stageVal = site.stage != null && String(site.stage).trim() !== '' ? String(site.stage).trim() : 'Potential'
              const aidaVal = site.aidaStatus != null && String(site.aidaStatus).trim() !== '' ? String(site.aidaStatus).trim() : 'Awareness'
              const siteData = {
                clientId: id,
                name: site.name || '',
                address: site.address || '',
                contactPerson: site.contactPerson || '',
                contactPhone: site.contactPhone ?? site.phone ?? '',
                contactEmail: site.contactEmail ?? site.email ?? '',
                notes: site.notes || '',
                siteLead: site.siteLead ?? '',
                stage: stageVal,
                aidaStatus: aidaVal
              }
              // Resolve target id: use site.id if it exists in DB, else match by index to existing site (list view often sends by index)
              let targetId = site.id && existingSiteIds.has(site.id) ? site.id : null
              if (!targetId && existingSites[idx]) {
                targetId = existingSites[idx].id
              }
              if (targetId) {
                await prisma.clientSite.update({
                  where: { id: targetId },
                  data: siteData
                })
                sitesToKeep.add(targetId)
              } else if (site.id) {
                try {
                  await prisma.clientSite.create({
                    data: { id: site.id, ...siteData }
                  })
                  sitesToKeep.add(site.id)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientSite.update({
                      where: { id: site.id },
                      data: siteData
                    })
                    sitesToKeep.add(site.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientSite.create({ data: siteData })
                sitesToKeep.add(created.id)
              }
            }
            
            await prisma.clientSite.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(sitesToKeep) } }
              }
            })
          } catch (siteSyncError) {
            console.warn('⚠️ Failed to sync sites to normalized table:', siteSyncError.message, siteSyncError.stack)
          }
        } else {
          console.log(`📝 [LEADS ID] body.sites not provided for lead ${id}, skipping site sync`)
        }
        
        // Contracts
        if (body.contracts !== undefined) {
          let contractsArray = []
          if (Array.isArray(body.contracts)) {
            contractsArray = body.contracts
          } else if (typeof body.contracts === 'string' && body.contracts.trim()) {
            try {
              contractsArray = JSON.parse(body.contracts)
            } catch (e) {
              contractsArray = []
            }
          }
          
          try {
            const existingContracts = await prisma.clientContract.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingContractIds = new Set(existingContracts.map(c => c.id))
            const contractsToKeep = new Set()
            
            for (const contract of contractsArray) {
              const contractData = {
                clientId: id,
                name: contract.name || '',
                size: contract.size || 0,
                type: contract.type || '',
                url: contract.url || '',
                uploadDate: contract.uploadDate ? new Date(contract.uploadDate) : new Date()
              }
              
              if (contract.id && existingContractIds.has(contract.id)) {
                await prisma.clientContract.update({
                  where: { id: contract.id },
                  data: contractData
                })
                contractsToKeep.add(contract.id)
              } else if (contract.id) {
                try {
                  await prisma.clientContract.create({
                    data: { id: contract.id, ...contractData }
                  })
                  contractsToKeep.add(contract.id)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientContract.update({
                      where: { id: contract.id },
                      data: contractData
                    })
                    contractsToKeep.add(contract.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientContract.create({ data: contractData })
                contractsToKeep.add(created.id)
              }
            }
            
            await prisma.clientContract.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(contractsToKeep) } }
              }
            })
          } catch (contractSyncError) {
            console.warn('⚠️ Failed to sync contracts to normalized table:', contractSyncError.message)
          }
        }
        
        // Proposals
        if (body.proposals !== undefined) {
          let proposalsArray = []
          if (Array.isArray(body.proposals)) {
            proposalsArray = body.proposals
          } else if (typeof body.proposals === 'string' && body.proposals.trim()) {
            try {
              proposalsArray = JSON.parse(body.proposals)
            } catch (e) {
              proposalsArray = []
            }
          }
          
          try {
            const existingProposals = await prisma.clientProposal.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingProposalIds = new Set(existingProposals.map(p => p.id))
            const proposalsToKeep = new Set()
            
            for (const proposal of proposalsArray) {
              const proposalData = {
                clientId: id,
                title: proposal.title || '',
                amount: proposal.amount || 0,
                status: proposal.status || 'Pending',
                workingDocumentLink: proposal.workingDocumentLink || '',
                createdDate: proposal.createdDate ? new Date(proposal.createdDate) : null,
                expiryDate: proposal.expiryDate ? new Date(proposal.expiryDate) : null,
                notes: proposal.notes || ''
              }
              
              if (proposal.id && existingProposalIds.has(proposal.id)) {
                await prisma.clientProposal.update({
                  where: { id: proposal.id },
                  data: proposalData
                })
                proposalsToKeep.add(proposal.id)
              } else if (proposal.id) {
                try {
                  await prisma.clientProposal.create({
                    data: { id: proposal.id, ...proposalData }
                  })
                  proposalsToKeep.add(proposal.id)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientProposal.update({
                      where: { id: proposal.id },
                      data: proposalData
                    })
                    proposalsToKeep.add(proposal.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientProposal.create({ data: proposalData })
                proposalsToKeep.add(created.id)
              }
            }
            
            await prisma.clientProposal.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(proposalsToKeep) } }
              }
            })
          } catch (proposalSyncError) {
            console.warn('⚠️ Failed to sync proposals to normalized table:', proposalSyncError.message)
          }
        }
        
        // FollowUps
        if (body.followUps !== undefined) {
          let followUpsArray = []
          if (Array.isArray(body.followUps)) {
            followUpsArray = body.followUps
          } else if (typeof body.followUps === 'string' && body.followUps.trim()) {
            try {
              followUpsArray = JSON.parse(body.followUps)
            } catch (e) {
              console.error('❌ [LEADS ID] Failed to parse followUps JSON:', e.message)
              followUpsArray = []
            }
          }
          
          console.log(`📝 [LEADS ID] Processing ${followUpsArray.length} followUps for lead ${id}`)
          
          try {
            const existingFollowUps = await prisma.clientFollowUp.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingFollowUpIds = new Set(existingFollowUps.map(f => f.id))
            const followUpsToKeep = new Set()
            
            for (const followUp of followUpsArray) {
              const followUpData = {
                clientId: id,
                date: followUp.date || '',
                time: followUp.time || '',
                type: followUp.type || 'Call',
                description: followUp.description || '',
                completed: !!followUp.completed,
                assignedTo: followUp.assignedTo || null
              }
              
              if (followUp.id && existingFollowUpIds.has(followUp.id)) {
                await prisma.clientFollowUp.update({
                  where: { id: followUp.id },
                  data: followUpData
                })
                followUpsToKeep.add(followUp.id)
                console.log(`✅ [LEADS ID] Updated followUp ${followUp.id} for lead ${id}`)
              } else if (followUp.id) {
                try {
                  await prisma.clientFollowUp.create({
                    data: { id: followUp.id, ...followUpData }
                  })
                  followUpsToKeep.add(followUp.id)
                  console.log(`✅ [LEADS ID] Created followUp ${followUp.id} for lead ${id}`)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientFollowUp.update({
                      where: { id: followUp.id },
                      data: followUpData
                    })
                    followUpsToKeep.add(followUp.id)
                    console.log(`✅ [LEADS ID] Updated followUp ${followUp.id} after ID conflict for lead ${id}`)
                  } else {
                    console.error(`❌ [LEADS ID] Failed to create followUp ${followUp.id}:`, createError.message)
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientFollowUp.create({ data: followUpData })
                followUpsToKeep.add(created.id)
                console.log(`✅ [LEADS ID] Created new followUp ${created.id} for lead ${id}`)
              }
            }
            
            await prisma.clientFollowUp.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(followUpsToKeep) } }
              }
            })
            
            console.log(`✅ [LEADS ID] Successfully synced ${followUpsArray.length} followUps to normalized table for lead ${id}`)
          } catch (followUpSyncError) {
            console.error('❌ [LEADS ID] Failed to sync followUps to normalized table:', followUpSyncError.message)
            console.error('❌ [LEADS ID] FollowUp sync error details:', {
              message: followUpSyncError.message,
              code: followUpSyncError.code,
              stack: followUpSyncError.stack
            })
            // Don't throw - allow lead update to succeed even if followUp sync fails
            // The JSON field will still be updated above
          }
        }
        
        // Services
        if (body.services !== undefined) {
          let servicesArray = []
          if (Array.isArray(body.services)) {
            servicesArray = body.services
          } else if (typeof body.services === 'string' && body.services.trim()) {
            try {
              servicesArray = JSON.parse(body.services)
            } catch (e) {
              servicesArray = []
            }
          }
          
          try {
            const existingServices = await prisma.clientService.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingServiceIds = new Set(existingServices.map(s => s.id))
            const servicesToKeep = new Set()
            
            for (const service of servicesArray) {
              const serviceData = {
                clientId: id,
                name: service.name || '',
                description: service.description || '',
                price: service.price || 0,
                status: service.status || 'Active',
                startDate: service.startDate ? new Date(service.startDate) : null,
                endDate: service.endDate ? new Date(service.endDate) : null,
                notes: service.notes || ''
              }
              
              if (service.id && existingServiceIds.has(service.id)) {
                await prisma.clientService.update({
                  where: { id: service.id },
                  data: serviceData
                })
                servicesToKeep.add(service.id)
              } else if (service.id) {
                try {
                  await prisma.clientService.create({
                    data: { id: service.id, ...serviceData }
                  })
                  servicesToKeep.add(service.id)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientService.update({
                      where: { id: service.id },
                      data: serviceData
                    })
                    servicesToKeep.add(service.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientService.create({ data: serviceData })
                servicesToKeep.add(created.id)
              }
            }
            
            await prisma.clientService.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(servicesToKeep) } }
              }
            })
          } catch (serviceSyncError) {
            console.warn('⚠️ Failed to sync services to normalized table:', serviceSyncError.message)
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
            // Don't block the lead update if industry sync fails
            console.warn('⚠️ Error syncing industry:', industryError.message)
          }
        }
        
        // Now update it
        let lead = await prisma.client.update({
          where: { id },
          data: updateData,
          include: {
            clientContacts: true,
            clientComments: true,
            clientSites: true,
            clientContracts: true,
            clientProposals: true,
            clientFollowUps: true,
            clientServices: true,
            projects: { select: { id: true, name: true, status: true } },
            externalAgent: true,
            groupMemberships: {
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
            }
          }
        })
        
        // Apply group membership replacement if provided (Company Group dropdown)
        const groupIdsToSet = body.groupIds === undefined
          ? undefined
          : (Array.isArray(body.groupIds) ? body.groupIds.filter(Boolean) : [])
        if (groupIdsToSet !== undefined) {
          try {
            await prisma.clientCompanyGroup.deleteMany({ where: { clientId: id } })
            for (const gid of groupIdsToSet) {
              if (gid) {
                await prisma.clientCompanyGroup.create({
                  data: { clientId: id, groupId: String(gid), role: 'member' }
                })
              }
            }
            lead = await prisma.client.findUnique({
              where: { id },
              include: {
                clientContacts: true,
                clientComments: true,
                clientSites: true,
                clientContracts: true,
                clientProposals: true,
                clientFollowUps: true,
                clientServices: true,
                projects: { select: { id: true, name: true, status: true } },
                externalAgent: true,
                groupMemberships: {
                  include: {
                    group: { select: { id: true, name: true, type: true, industry: true } }
                  }
                }
              }
            })
          } catch (groupErr) {
            console.error('❌ [LEADS ID] Failed to update lead group memberships:', groupErr)
            return serverError(res, 'Failed to update group memberships', groupErr.message)
          }
        }
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== lead.name) {
          // Trigger RSS search asynchronously (don't block the response)
          searchAndSaveNewsForClient(lead.id, lead.name, lead.website || oldWebsite || '').catch(error => {
            console.error('❌ Error updating RSS feed after name change:', error)
          })
        }
        
        // Parse JSON fields before returning using shared utility
        const parsedLead = parseClientJsonFields(lead)
        
        // Log contacts to verify they're being returned
        console.log(`📋 [LEADS ID] Returning lead ${id} with ${parsedLead.contacts?.length || 0} contacts`)
        if (parsedLead.contacts && parsedLead.contacts.length > 0) {
          console.log(`📋 [LEADS ID] Contact names:`, parsedLead.contacts.map(c => c.name).join(', '))
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
    // Enhanced error logging with full context
    console.error('❌ [LEADS ID] Unhandled error in leads [id] API:', error)
    console.error('❌ [LEADS ID] Error stack:', error.stack)
    console.error('❌ [LEADS ID] Error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      meta: error.meta,
      url: req.url,
      method: req.method,
      id: req.params?.id,
      query: req.query,
      headers: {
        authorization: req.headers.authorization ? 'Bearer ***' : undefined,
        host: req.headers.host,
        'user-agent': req.headers['user-agent']
      }
    })
    
    // Log to stderr for better visibility in production logs
    console.error('❌ [LEADS ID] FULL ERROR CONTEXT:', JSON.stringify({
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: error.code,
        name: error.name,
        meta: error.meta,
        stack: error.stack
      },
      request: {
        method: req.method,
        url: req.url,
        id: req.params?.id
      }
    }, null, 2))
    
    // Provide detailed error information
    const errorDetails = error.meta 
      ? `Unhandled error: ${error.name || 'Error'} (${error.code || 'UNKNOWN'}), Message: ${error.message || 'Unknown error'}, Meta: ${JSON.stringify(error.meta)}`
      : `Unhandled error: ${error.name || 'Error'} (${error.code || 'UNKNOWN'}), Message: ${error.message || 'Unknown error'}`
    
    // Check if response was already sent
    if (res.headersSent || res.writableEnded) {
      console.error('❌ [LEADS ID] Cannot send error response - already sent')
      return
    }
    
    return serverError(res, 'Internal server error', errorDetails)
  }
}

export default withHttp(withLogging(authRequired(handler)))
