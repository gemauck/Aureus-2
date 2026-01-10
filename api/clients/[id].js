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

        // Phase 3 & 6: Get normalized data using raw SQL
        let normalizedContacts = []
        let normalizedComments = []
        let normalizedSites = []
        let normalizedContracts = []
        let normalizedProposals = []
        let normalizedFollowUps = []
        let normalizedServices = []
        let clientProjects = []
        try {
          // Fetch contacts from normalized table
          const contactsResult = await prisma.$queryRaw`
            SELECT id, "clientId", name, email, phone, mobile, role, title, "isPrimary", notes, "createdAt"
            FROM "ClientContact"
            WHERE "clientId" = ${id}
            ORDER BY "isPrimary" DESC, "createdAt" ASC
          `
          normalizedContacts = contactsResult || []
          
          // Fetch comments from normalized table
          const commentsResult = await prisma.$queryRaw`
            SELECT id, "clientId", text, "authorId", author, "userName", "createdAt"
            FROM "ClientComment"
            WHERE "clientId" = ${id}
            ORDER BY "createdAt" DESC
          `
          normalizedComments = commentsResult || []
          
          // Phase 6: Fetch sites from normalized table
          const sitesResult = await prisma.$queryRaw`
            SELECT id, "clientId", name, address, "contactPerson", "contactPhone", "contactEmail", notes, "createdAt"
            FROM "ClientSite"
            WHERE "clientId" = ${id}
            ORDER BY "createdAt" ASC
          `
          normalizedSites = sitesResult || []
          
          // Phase 6: Fetch contracts from normalized table
          const contractsResult = await prisma.$queryRaw`
            SELECT id, "clientId", name, size, type, "uploadDate", url, "createdAt"
            FROM "ClientContract"
            WHERE "clientId" = ${id}
            ORDER BY "uploadDate" DESC
          `
          normalizedContracts = contractsResult || []
          
          // Phase 6: Fetch proposals from normalized table
          const proposalsResult = await prisma.$queryRaw`
            SELECT id, "clientId", title, amount, status, "workingDocumentLink", "createdDate", "expiryDate", notes, "createdAt"
            FROM "ClientProposal"
            WHERE "clientId" = ${id}
            ORDER BY "createdDate" DESC
          `
          normalizedProposals = proposalsResult || []
          
          // Phase 6: Fetch followUps from normalized table
          const followUpsResult = await prisma.$queryRaw`
            SELECT id, "clientId", date, time, type, description, completed, "assignedTo", "createdAt"
            FROM "ClientFollowUp"
            WHERE "clientId" = ${id}
            ORDER BY date ASC, time ASC
          `
          normalizedFollowUps = followUpsResult || []
          
          // Phase 6: Fetch services from normalized table
          const servicesResult = await prisma.$queryRaw`
            SELECT id, "clientId", name, description, price, status, "startDate", "endDate", notes, "createdAt"
            FROM "ClientService"
            WHERE "clientId" = ${id}
            ORDER BY "startDate" DESC
          `
          normalizedServices = servicesResult || []
          
          // Phase 4: Get projects via relation (instead of projectIds JSON)
          const projectsResult = await prisma.$queryRaw`
            SELECT id, name, status
            FROM "Project"
            WHERE "clientId" = ${id}
            ORDER BY "createdAt" DESC
          `
          clientProjects = projectsResult || []
        } catch (normError) {
          // If normalized tables don't exist yet, that's okay - will fallback to JSON
          console.warn(`⚠️ Could not fetch normalized data (may not exist yet):`, normError.message)
        }
        
        // Add normalized data to client object for parsing
        clientBasic.clientContacts = normalizedContacts.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          role: c.role,
          title: c.title,
          isPrimary: c.isPrimary,
          notes: c.notes,
          createdAt: c.createdAt
        }))
        clientBasic.clientComments = normalizedComments.map(c => ({
          id: c.id,
          text: c.text,
          author: c.author,
          authorId: c.authorId,
          userName: c.userName,
          createdAt: c.createdAt
        }))
        // Phase 6: Add normalized sites, contracts, proposals, followUps, services
        clientBasic.clientSites = normalizedSites.map(s => ({
          id: s.id,
          name: s.name,
          address: s.address,
          contactPerson: s.contactPerson,
          contactPhone: s.contactPhone,
          contactEmail: s.contactEmail,
          notes: s.notes,
          createdAt: s.createdAt
        }))
        clientBasic.clientContracts = normalizedContracts.map(c => ({
          id: c.id,
          name: c.name,
          size: c.size,
          type: c.type,
          uploadDate: c.uploadDate,
          url: c.url,
          createdAt: c.createdAt
        }))
        clientBasic.clientProposals = normalizedProposals.map(p => ({
          id: p.id,
          title: p.title,
          amount: p.amount,
          status: p.status,
          workingDocumentLink: p.workingDocumentLink,
          createdDate: p.createdDate,
          expiryDate: p.expiryDate,
          notes: p.notes,
          createdAt: p.createdAt
        }))
        clientBasic.clientFollowUps = normalizedFollowUps.map(f => ({
          id: f.id,
          date: f.date,
          time: f.time,
          type: f.type,
          description: f.description,
          completed: f.completed,
          assignedTo: f.assignedTo,
          createdAt: f.createdAt
        }))
        clientBasic.clientServices = normalizedServices.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
          notes: s.notes,
          createdAt: s.createdAt
        }))
        // Phase 4: Add projects relation data
        clientBasic.projects = clientProjects.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status
        }))

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

        // Combine client data with group memberships and normalized data
        const client = {
          ...clientBasic,
          groupMemberships,
          clientContacts: clientBasic.clientContacts || [],
          clientComments: clientBasic.clientComments || []
        }
        
        // Phase 3: Use shared parseClientJsonFields which handles normalized tables, JSONB, and String fallback
        const parsedClient = parseClientJsonFields(client)
        
        // Legacy parsing for other fields (if parseClientJsonFields didn't handle them)
        const jsonFields = ['followUps', 'projectIds', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
        for (const field of jsonFields) {
          try {
            const value = parsedClient[field]
            if (typeof value === 'string' && value && parsedClient[field] === value) {
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
      
      try {
        // Check if name is being updated - fetch current client first
        let oldName = null
        let oldWebsite = null
        const existing = await prisma.client.findUnique({ 
          where: { id },
          select: { name: true, website: true, type: true }
        })
        
        if (!existing) {
          return notFound(res)
        }
        
        // Verify this is a client, not a lead
        if (existing.type === 'lead') {
          return badRequest(res, 'Cannot update lead through clients endpoint. Use /api/leads/[id] instead.')
        }
        
        oldName = existing.name
        oldWebsite = existing.website
        
        // Phase 5: Prepare update data with normalized table sync support
        const updateData = {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.industry !== undefined && { industry: body.industry }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.revenue !== undefined && { revenue: body.revenue }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.probability !== undefined && { probability: body.probability }),
          ...(body.lastContact !== undefined && { lastContact: body.lastContact ? new Date(body.lastContact) : null }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.website !== undefined && { website: body.website }),
          ...(body.notes !== undefined && { notes: body.notes })
        }
        
        // Phase 5: Handle contacts separately to sync to normalized ClientContact table
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
          
          // Normalized ClientContact table is the source of truth - no JSON writes
          // Sync to normalized ClientContact table
          // IMPORTANT: This is the source of truth - save to table first, then sync JSON
          try {
            // Get existing contacts to compare
            const existingContacts = await prisma.clientContact.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingContactIds = new Set(existingContacts.map(c => c.id))
            
            // Process each contact with upsert to handle duplicates properly
            const contactsToKeep = new Set()
            
            for (const contact of contactsArray) {
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
              
              // Use upsert to handle both create and update
              if (contact.id && existingContactIds.has(contact.id)) {
                // Update existing contact
                await prisma.clientContact.update({
                  where: { id: contact.id },
                  data: contactData
                })
                contactsToKeep.add(contact.id)
              } else if (contact.id) {
                // Create with specific ID
                try {
                  await prisma.clientContact.create({
                    data: {
                      id: contact.id,
                      ...contactData
                    }
                  })
                  contactsToKeep.add(contact.id)
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientContact.update({
                      where: { id: contact.id },
                      data: contactData
                    })
                    contactsToKeep.add(contact.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                // Create without ID (Prisma generates one)
                const created = await prisma.clientContact.create({
                  data: contactData
                })
                contactsToKeep.add(created.id)
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
            
            console.log(`✅ Synced ${contactsArray.length} contacts to normalized table for client ${id}`)
          } catch (contactSyncError) {
            console.error('❌ Failed to sync contacts to normalized table:', contactSyncError)
            console.error('Error details:', contactSyncError.message, contactSyncError.code)
            // Still continue - contacts are saved in JSON for backward compatibility
            // But log as error so it's visible in production
          }
        }
        
        // Phase 5: Handle comments separately to sync to normalized ClientComment table
        if (body.comments !== undefined) {
          let commentsArray = []
          if (Array.isArray(body.comments)) {
            commentsArray = body.comments
          } else if (typeof body.comments === 'string' && body.comments.trim()) {
            try {
              commentsArray = JSON.parse(body.comments)
            } catch (e) {
              commentsArray = []
            }
          }
          
          // Normalized ClientComment table is the source of truth - no JSON writes
          // Sync to normalized ClientComment table
          // IMPORTANT: This is the source of truth - save to table first, then sync JSON
          try {
            // Get current user info for authorId
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
                // User lookup failed, continue with empty values
              }
            }
            
            // Get existing comments to compare
            const existingComments = await prisma.clientComment.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingCommentIds = new Set(existingComments.map(c => c.id))
            const commentsToKeep = new Set()
            
            // Process each comment with upsert to handle duplicates properly
            for (const comment of commentsArray) {
              const commentData = {
                  clientId: id,
                  text: comment.text || '',
                  authorId: comment.authorId || userId || null,
                  author: comment.author || authorName || '',
                  userName: comment.userName || userName || null,
                  createdAt: comment.createdAt ? new Date(comment.createdAt) : undefined
              }
              
              // Use upsert to handle both create and update
              if (comment.id && existingCommentIds.has(comment.id)) {
                // Update existing comment
                await prisma.clientComment.update({
                  where: { id: comment.id },
                  data: commentData
                })
                commentsToKeep.add(comment.id)
              } else if (comment.id) {
                // Create with specific ID
                try {
                  await prisma.clientComment.create({
                    data: {
                      id: comment.id,
                      ...commentData
                    }
                  })
                  commentsToKeep.add(comment.id)
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientComment.update({
                      where: { id: comment.id },
                      data: commentData
                    })
                    commentsToKeep.add(comment.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                // Create without ID (Prisma generates one)
                const created = await prisma.clientComment.create({
                  data: commentData
                })
                commentsToKeep.add(created.id)
              }
            }
            
            // Delete comments that are no longer in the array
            await prisma.clientComment.deleteMany({
              where: {
                clientId: id,
                NOT: {
                  id: { in: Array.from(commentsToKeep) }
                }
              }
            })
            
            console.log(`✅ Synced ${commentsArray.length} comments to normalized table for client ${id}`)
            
            // CRITICAL FIX: Write comments back to JSON fields for persistence and backward compatibility
            // This ensures comments persist even if normalized table sync fails, and enables client-side caching
            updateData.comments = JSON.stringify(commentsArray)
            updateData.commentsJsonb = commentsArray
          } catch (commentSyncError) {
            console.error('❌ Failed to sync comments to normalized table:', commentSyncError)
            console.error('Error details:', commentSyncError.message, commentSyncError.code)
            // Still write to JSON fields even if normalized table sync fails (backward compatibility)
            updateData.comments = JSON.stringify(commentsArray)
            updateData.commentsJsonb = commentsArray
          }
        }
        
        // Phase 6: Handle sites, contracts, proposals, followUps, services separately to sync to normalized tables
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
          
          try {
            const existingSites = await prisma.clientSite.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingSiteIds = new Set(existingSites.map(s => s.id))
            const sitesToKeep = new Set()
            
            for (const site of sitesArray) {
              const siteData = {
                clientId: id,
                name: site.name || '',
                address: site.address || '',
                contactPerson: site.contactPerson || '',
                contactPhone: site.contactPhone || '',
                contactEmail: site.contactEmail || '',
                notes: site.notes || ''
              }
              
              if (site.id && existingSiteIds.has(site.id)) {
                await prisma.clientSite.update({
                  where: { id: site.id },
                  data: siteData
                })
                sitesToKeep.add(site.id)
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
            console.warn('⚠️ Failed to sync sites to normalized table:', siteSyncError.message)
          }
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
              followUpsArray = []
            }
          }
          
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
              } else if (followUp.id) {
                try {
                  await prisma.clientFollowUp.create({
                    data: { id: followUp.id, ...followUpData }
                  })
                  followUpsToKeep.add(followUp.id)
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientFollowUp.update({
                      where: { id: followUp.id },
                      data: followUpData
                    })
                    followUpsToKeep.add(followUp.id)
                  } else {
                    throw createError
                  }
                }
              } else {
                const created = await prisma.clientFollowUp.create({ data: followUpData })
                followUpsToKeep.add(created.id)
              }
            }
            
            await prisma.clientFollowUp.deleteMany({
              where: {
                clientId: id,
                NOT: { id: { in: Array.from(followUpsToKeep) } }
              }
            })
            
            console.log(`✅ Synced ${followUpsArray.length} followUps to normalized table for client ${id}`)
            
            // CRITICAL FIX: Write followUps back to JSON fields for persistence and backward compatibility
            // This ensures followUps persist even if normalized table sync fails, and enables client-side caching
            updateData.followUps = JSON.stringify(followUpsArray)
            updateData.followUpsJsonb = followUpsArray
          } catch (followUpSyncError) {
            console.warn('⚠️ Failed to sync followUps to normalized table:', followUpSyncError.message)
            // Still write to JSON fields even if normalized table sync fails (backward compatibility)
            updateData.followUps = JSON.stringify(followUpsArray)
            updateData.followUpsJsonb = followUpsArray
          }
        }
        
        // Services
        // Handle both string arrays (simple tags like ['Self-Managed FMS']) and object arrays (full service records)
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
          
          // CRITICAL FIX: Also save services as JSON field for persistence
          // This ensures services persist even if normalized table sync fails
          // Convert to array of strings for JSON storage (frontend expects simple string array)
          const servicesForJson = servicesArray.map(s => {
            // If service is a string, use it directly
            if (typeof s === 'string') {
              return s
            }
            // If service is an object, use its name
            return s.name || s
          })
          
          // Save to JSON fields (both String and JSONB for backward compatibility)
          updateData.services = JSON.stringify(servicesForJson)
          updateData.servicesJsonb = servicesForJson
          
          // Also sync to normalized table if services are objects with full details
          // Skip normalized table sync if all services are simple strings (tags)
          const hasServiceObjects = servicesArray.some(s => typeof s === 'object' && s !== null && (s.description !== undefined || s.price !== undefined))
          
          if (hasServiceObjects) {
          try {
            const existingServices = await prisma.clientService.findMany({
              where: { clientId: id },
              select: { id: true }
            })
            const existingServiceIds = new Set(existingServices.map(s => s.id))
            const servicesToKeep = new Set()
            
            for (const service of servicesArray) {
                // Skip string services in normalized table - they're just tags
                if (typeof service === 'string') {
                  continue
                }
                
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
              // Don't fail the entire update - JSON field is already saved above
            }
          }
        }
        
        // Phase 2: Prepare other JSON fields with dual-write (String + JSONB)
        // Only activityLog remains as JSON (log data, not normalized)
        const jsonFieldsData = prepareJsonFieldsForDualWrite(body)
        Object.assign(updateData, jsonFieldsData)
        
        // If industry is being updated, ensure it exists in Industry table
        if (updateData.industry && updateData.industry.trim()) {
          const industryName = updateData.industry.trim()
          try {
            const existingIndustry = await prisma.industry.findUnique({
              where: { name: industryName }
            })
            
            if (!existingIndustry) {
              try {
                await prisma.industry.create({
                  data: {
                    name: industryName,
                    isActive: true
                  }
                })
              } catch (createError) {
                if (!createError.message.includes('Unique constraint') && createError.code !== 'P2002') {
                  console.warn(`⚠️ Could not create industry "${industryName}":`, createError.message)
                }
              }
            } else if (!existingIndustry.isActive) {
              await prisma.industry.update({
                where: { id: existingIndustry.id },
                data: { isActive: true }
              })
            }
          } catch (industryError) {
            console.warn('⚠️ Error syncing industry:', industryError.message)
          }
        }
        
        // Check if there are any fields to update
        if (Object.keys(updateData).length === 0) {
          // No fields to update, just fetch and return current client
          const client = await prisma.client.findUnique({
            where: { id },
            include: {
              clientContacts: true,
              clientComments: true,
              clientSites: true,
              clientContracts: true,
              clientProposals: true,
              clientFollowUps: true,
              clientServices: true,
              projects: { select: { id: true, name: true, status: true } }
            }
          })
          
          if (!client) {
            return notFound(res)
          }
          
          const parsedClient = parseClientJsonFields(client)
          return ok(res, { client: parsedClient })
        }
        
        // Update the client
        const client = await prisma.client.update({
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
            projects: { select: { id: true, name: true, status: true } }
          }
        })
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== client.name) {
          searchAndSaveNewsForClient(client.id, client.name, client.website || oldWebsite || '').catch(error => {
            console.error('❌ Error updating RSS feed after name change:', error)
          })
        }
        
        // Parse JSON fields before returning using shared utility
        const parsedClient = parseClientJsonFields(client)
        
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
