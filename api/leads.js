// Leads API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'
import { checkForDuplicates, formatDuplicateError } from './_lib/duplicateValidation.js'
import { parseClientJsonFields, prepareJsonFieldsForDualWrite, DEFAULT_BILLING_TERMS } from './_lib/clientJsonFields.js'

// Phase 2: JSON field parsing and dual-write utilities moved to shared module
// See: api/_lib/clientJsonFields.js

async function handler(req, res) {
  try {
    
    // Parse the URL path - strip /api/ prefix if present
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Leads (GET /api/leads)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'leads') {
      try {
        
        // Ensure database connection
        try {
          await prisma.$connect()
        } catch (connError) {
          console.warn('⚠️ Connection check failed (may reconnect automatically):', connError.message)
        }
        
        // Ensure type column exists in database
        try {
          await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`
        } catch (schemaError) {
          // Column might already exist - this is expected if schema is up to date
        }
        
        // Ensure services column exists in database (PostgreSQL compatible)
        try {
          // Check if column exists first
          const columnExists = await prisma.$queryRaw`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'Client' AND column_name = 'services'
          `
          if (!columnExists || columnExists.length === 0) {
            await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN "services" TEXT DEFAULT '[]'`
          } else {
          }
        } catch (schemaError) {
          // If error contains "already exists" or "duplicate", column already exists
          if (schemaError.message && (schemaError.message.includes('already exists') || schemaError.message.includes('duplicate'))) {
          } else {
          }
        }
        
        const userId = req.user?.sub
        const userEmail = req.user?.email || 'unknown'
        
        // Verify userId exists before using it in relation
        let validUserId = null
        if (userId) {
          try {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
            if (userExists) {
              validUserId = userId
            } else {
              console.warn('⚠️ User does not exist in database:', userId)
            }
          } catch (userCheckError) {
            // User doesn't exist, skip starredBy relation
            console.warn('⚠️ User check failed, skipping starredBy relation:', userId, userCheckError.message)
          }
        }
        
        // Check if externalAgentId column exists before including relation
        let hasExternalAgentId = false
        try {
          // Check for column with case-insensitive table name (PostgreSQL stores unquoted identifiers in lowercase)
          const columnCheck = await prisma.$queryRaw`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE LOWER(table_name) = 'client' AND column_name = 'externalAgentId'
          `
          hasExternalAgentId = Array.isArray(columnCheck) && columnCheck.length > 0
          if (!hasExternalAgentId) {
            console.warn('⚠️ externalAgentId column does not exist, skipping externalAgent relation')
          }
        } catch (columnCheckError) {
          console.warn('⚠️ Failed to check for externalAgentId column, assuming it does not exist:', columnCheckError.message)
          hasExternalAgentId = false
        }
        
        // Check if ClientCompanyGroup table exists before trying to include it
        let hasGroupMembershipsTable = true
        try {
          const tableCheck = await prisma.$queryRaw`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_name = 'ClientCompanyGroup'
            ) as exists
          `
          hasGroupMembershipsTable = tableCheck && tableCheck[0] && tableCheck[0].exists === true
          if (!hasGroupMembershipsTable) {
            console.warn('⚠️ ClientCompanyGroup table does not exist, skipping groupMemberships relation')
          }
        } catch (tableCheckError) {
          console.warn('⚠️ Failed to check for ClientCompanyGroup table, assuming it exists:', tableCheckError.message)
          hasGroupMembershipsTable = true // Assume it exists if check fails
        }
        
        let leads = []
        try {
          // IMPORTANT: Return ALL leads regardless of ownerId - all users should see all leads
          // EXPLICITLY exclude ownerId from WHERE clause to ensure all leads are returned
          // Use defensive includes - if relations fail, try without them
          try {
            const includeObj = {
              // Only include externalAgent if the column exists
              ...(hasExternalAgentId ? { externalAgent: true } : {}),
              // Include starredBy relation only if we have a valid userId
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
              } : {}),
              // Include group memberships only if table exists
              ...(hasGroupMembershipsTable ? {
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
              } : {}),
              // Phase 3 & 6: Include normalized tables
              clientContacts: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  mobile: true,
                  role: true,
                  title: true,
                  isPrimary: true,
                  notes: true
                },
                orderBy: {
                  isPrimary: 'desc',
                  createdAt: 'asc'
                }
              },
              clientComments: {
                select: {
                  id: true,
                  text: true,
                  author: true,
                  authorId: true,
                  userName: true,
                  createdAt: true
                },
                orderBy: {
                  createdAt: 'desc'
                }
              },
              // Phase 6: Include normalized tables
              clientSites: true,
              clientContracts: true,
              clientProposals: true,
              clientFollowUps: true,
              clientServices: true
            }
            
            // If table doesn't exist, we'll set empty groupMemberships after query
            
            leads = await prisma.client.findMany({ 
              where: { 
                type: 'lead'
                // Explicitly NO ownerId filter - all users see all leads
              },
              include: includeObj,
              orderBy: { createdAt: 'desc' } 
            })
            
            // If table doesn't exist, manually set empty groupMemberships
            if (!hasGroupMembershipsTable) {
              leads = leads.map(lead => ({
                ...lead,
                groupMemberships: []
              }))
            }
          } catch (relationError) {
            // Check if it's the externalAgentId column missing error
            const isMissingColumnError = relationError.code === 'P2022' && 
                                       relationError.message?.includes('externalAgentId')
            
            if (isMissingColumnError) {
              // Try query without externalAgent relation
              console.warn('⚠️ externalAgentId column missing, querying without externalAgent relation:', relationError.message)
              try {
                leads = await prisma.client.findMany({ 
                  where: { 
                    type: 'lead'
                  },
                  include: {
                    // Skip externalAgent relation
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
                    } : {}),
                    // Include group memberships only if table exists
                    ...(hasGroupMembershipsTable ? {
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
                    } : {}),
                    // Phase 3: Include normalized tables
                    clientContacts: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        mobile: true,
                        role: true,
                        title: true,
                        isPrimary: true,
                        notes: true
                      },
                      orderBy: {
                        isPrimary: 'desc',
                        createdAt: 'asc'
                      }
                    },
                    clientComments: {
                      select: {
                        id: true,
                        text: true,
                        author: true,
                        authorId: true,
                        userName: true,
                        createdAt: true
                      },
                      orderBy: {
                        createdAt: 'desc'
                      }
                    },
                    // Phase 4: Include projects relation to derive projectIds
                    projects: {
                      select: {
                        id: true,
                        name: true,
                        status: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'desc' } 
                })
                // Add null externalAgent and empty groupMemberships to each lead
                leads = leads.map(l => ({ 
                  ...l, 
                  externalAgent: null,
                  ...(!hasGroupMembershipsTable ? { groupMemberships: [] } : {})
                }))
              } catch (fallbackError) {
                // If that also fails, try minimal query
                console.warn('⚠️ Query with tags failed, trying minimal query:', fallbackError.message)
                leads = await prisma.client.findMany({ 
                  where: { 
                    type: 'lead'
                  },
                  orderBy: { createdAt: 'desc' } 
                })
                // Add null externalAgent and empty groupMemberships to each lead
                leads = leads.map(l => ({ 
                  ...l, 
                  externalAgent: null,
                  groupMemberships: []
                }))
              }
            } else {
              // Other relation errors - try query without relations
              console.warn('⚠️ Query with relations failed, trying without relations:', relationError.message)
              leads = await prisma.client.findMany({ 
                where: { 
                  type: 'lead'
                },
                orderBy: { createdAt: 'desc' } 
              })
              // Add null externalAgent to each lead
              leads = leads.map(l => ({ ...l, externalAgent: null }))
            }
          }
          
          // DEBUG: Also check raw SQL to verify what's actually in database
          try {
            const rawLeads = await prisma.$queryRaw`
              SELECT id, name, type, "ownerId", "createdAt"
              FROM "Client"
              WHERE type = 'lead'
              ORDER BY "createdAt" DESC
            `
            if (rawLeads.length > 0) {
            }
            
            // Compare counts
            if (rawLeads.length !== leads.length) {
              console.error(`❌ MISMATCH: Prisma query returned ${leads.length} leads, but raw SQL returned ${rawLeads.length} leads!`)
              
              // Find which leads are missing
              const prismaIds = new Set(leads.map(l => l.id))
              const missingLeads = rawLeads.filter(rl => !prismaIds.has(rl.id))
              if (missingLeads.length > 0) {
                console.error(`❌ Missing leads from Prisma query:`, JSON.stringify(missingLeads, null, 2))
              }
            }
            
            // Also try case-insensitive search to catch any case issues
            const caseInsensitiveLeads = await prisma.$queryRaw`
              SELECT id, name, type, "ownerId", "createdAt"
              FROM "Client"
              WHERE LOWER(type) = 'lead'
              ORDER BY "createdAt" DESC
            `
            if (caseInsensitiveLeads.length !== rawLeads.length) {
              console.warn(`⚠️ Case sensitivity issue detected: Exact match found ${rawLeads.length} leads, case-insensitive found ${caseInsensitiveLeads.length} leads`)
            }
          } catch (sqlError) {
            console.warn('⚠️ Raw SQL query failed (non-critical):', sqlError.message)
          }
          
          // Log lead details for debugging visibility issues
          if (leads.length > 0) {
            const leadDetails = leads.map(l => ({ id: l.id, name: l.name, ownerId: l.ownerId || 'null', type: l.type }))
          } else {
            
            // Additional check: query ALL records to see what types exist
            try {
              const allTypes = await prisma.$queryRaw`
                SELECT type, COUNT(*) as count
                FROM "Client"
                GROUP BY type
              `
            } catch (e) {
              console.warn('⚠️ Type distribution query failed:', e.message)
            }
          }
        } catch (queryError) {
          console.error('❌ Primary query failed:', {
            message: queryError.message,
            code: queryError.code,
            meta: queryError.meta,
            stack: queryError.stack
          })
          
          // Fallback: If query fails, try without type filter and filter in memory
          console.warn('⚠️ Trying fallback query without type filter...')
          try {
            // IMPORTANT: Return ALL leads regardless of ownerId - all users should see all leads
            try {
              const allRecords = await prisma.client.findMany({
                include: {
                  // Skip tags relation (doesn't exist on Client model)
                  // Skip externalAgent relation in fallback (column may not exist)
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
                },
                orderBy: { createdAt: 'desc' }
                // No ownerId filter - all users see all leads
              })
              // Filter to only leads
              leads = allRecords.filter(record => {
                // If type exists, it must be 'lead'
                if (record.type !== null && record.type !== undefined && record.type !== '') {
                  return record.type === 'lead'
                }
                // If type is null/undefined/empty, skip (legacy data without type should not be treated as leads)
                return false
              })
              // Add null externalAgent to each lead
              leads = leads.map(l => ({ ...l, externalAgent: null }))
              // Log lead details for debugging visibility issues
              if (leads.length > 0) {
                const leadDetails = leads.map(l => ({ id: l.id, name: l.name, ownerId: l.ownerId || 'null' }))
              }
            } catch (fallbackRelationError) {
              // Check if it's the externalAgentId column missing error
              const isMissingColumnError = fallbackRelationError.code === 'P2022' && 
                                         fallbackRelationError.message?.includes('externalAgentId')
              
              if (isMissingColumnError) {
                // Try query without externalAgent relation
                console.warn('⚠️ externalAgentId column missing in fallback, querying without externalAgent relation')
                try {
                  const allRecords = await prisma.client.findMany({
                    include: {
                      // Skip tags relation (doesn't exist on Client model)
                      // Skip externalAgent relation
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
                    },
                    orderBy: { createdAt: 'desc' }
                  })
                  // Filter to only leads and add null externalAgent
                  leads = allRecords
                    .filter(record => {
                      if (record.type !== null && record.type !== undefined && record.type !== '') {
                        return record.type === 'lead'
                      }
                      return false
                    })
                    .map(l => ({ ...l, externalAgent: null }))
                } catch (minimalError) {
                  // Last resort: query without any relations
                  console.warn('⚠️ Fallback query with tags failed, trying minimal query:', minimalError.message)
                  const allRecords = await prisma.client.findMany({
                    orderBy: { createdAt: 'desc' }
                  })
                  // Filter to only leads and add empty tags and null externalAgent
                  leads = allRecords
                    .filter(record => {
                      if (record.type !== null && record.type !== undefined && record.type !== '') {
                        return record.type === 'lead'
                      }
                      return false
                    })
                    .map(l => ({ ...l, externalAgent: null }))
                }
              } else {
                // Last resort: query without any relations
                console.warn('⚠️ Fallback query with relations failed, trying minimal query:', fallbackRelationError.message)
                // Check if error is about missing column (like parentGroupId)
                const isMissingColumnError = fallbackRelationError.code === 'P2022' || 
                                           fallbackRelationError.message?.includes('does not exist')
                if (isMissingColumnError) {
                  // Use raw SQL query to avoid Prisma schema validation issues
                  console.warn('⚠️ Column missing error detected, using raw SQL query')
                  const allRecordsRaw = await prisma.$queryRaw`
                    SELECT id, name, type, industry, status, stage, revenue, value, probability, 
                           "lastContact", address, website, notes, contacts, "followUps", 
                           "projectIds", comments, sites, contracts, "activityLog", 
                           "billingTerms", "ownerId", "externalAgentId", "createdAt", "updatedAt",
                           proposals, thumbnail, services, "rssSubscribed"
                    FROM "Client"
                    ORDER BY "createdAt" DESC
                  `
                  const allRecords = allRecordsRaw.map(record => {
                    const parsed = parseClientJsonFields(record)
                    return parsed
                  })
                  leads = allRecords
                    .filter(record => {
                      if (record.type !== null && record.type !== undefined && record.type !== '') {
                        return record.type === 'lead'
                      }
                      return false
                    })
                    .map(l => ({ ...l, tags: [], externalAgent: null, groupMemberships: [] }))
                } else {
                  const allRecords = await prisma.client.findMany({
                    orderBy: { createdAt: 'desc' }
                  })
                  // Filter to only leads and add empty tags
                  leads = allRecords
                    .filter(record => {
                      if (record.type !== null && record.type !== undefined && record.type !== '') {
                        return record.type === 'lead'
                      }
                      return false
                    })
                    .map(l => ({ ...l, tags: [], externalAgent: null }))
                }
              }
            }
          } catch (fallbackError) {
            console.error('❌ Fallback query also failed:', {
              message: fallbackError.message,
              code: fallbackError.code,
              meta: fallbackError.meta,
              stack: fallbackError.stack
            })
            // Re-throw to be caught by outer catch block
            throw fallbackError
          }
        }
        
        // Parse JSON fields (services, contacts, etc.) and extract tags
        const parsedLeads = leads.map(lead => {
          const parsed = parseClientJsonFields(lead);
          
          // Preserve group data (groupMemberships are objects, not JSON strings)
          // These come from Prisma relations and should be preserved as-is
          const rawGroupMemberships = lead.groupMemberships || parsed.groupMemberships
          if (rawGroupMemberships && Array.isArray(rawGroupMemberships)) {
            parsed.groupMemberships = rawGroupMemberships
          } else {
            parsed.groupMemberships = []
          }
          
          // Check if current user has starred this lead
          // starredBy will always be an array (empty if no matches) due to Prisma relation behavior
          const starredByArray = Array.isArray(lead.starredBy) ? lead.starredBy : []
          const hasStarredBy = starredByArray.length > 0
          parsed.isStarred = !!(validUserId && hasStarredBy)
          
          // Debug logging for starred status (log first few leads and any that should be starred)
          // Use leads.length instead of parsedLeads.length since parsedLeads is still being created
          if (leads.length < 5 || hasStarredBy || lead.id === 'c56d932babacbb86cab2c2b30') {
          }
          
          return parsed;
        });
        
        // Final verification: Log response before sending to ensure all leads are included
        if (parsedLeads.length > 0) {
          // Log stage field for ReitCoal specifically
          const reitcoulLead = parsedLeads.find(l => l.name && l.name.toLowerCase().includes('reit'));
          if (reitcoulLead) {
          }
        }
        
        // CRITICAL: Double-check that we're not filtering by ownerId
        // Log database connection info to verify we're querying the same database
        try {
          const dbInfo = await prisma.$queryRaw`SELECT current_database() as db_name, current_user as db_user`
        } catch (e) {
          console.warn('⚠️ Could not get database info:', e.message)
        }
        
        // Add cache-busting headers to prevent browser caching
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
        
        return ok(res, { leads: parsedLeads })
      } catch (dbError) {
        // Log the error immediately with full details
        console.error('❌ Database error in GET /api/leads:', {
          message: dbError.message,
          name: dbError.name,
          code: dbError.code,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 1000),
          url: req.url,
          method: req.method
        })
        
        const isConnError = logDatabaseError(dbError, 'listing leads')
        
        // Enhanced error details for debugging
        const errorDetails = process.env.NODE_ENV === 'development'
          ? `${dbError.message || 'Unknown database error'} (Code: ${dbError.code || 'N/A'}, Name: ${dbError.name || 'N/A'})`
          : isConnError 
            ? 'The database server is unreachable. Please check your network connection and ensure the database server is running.'
            : 'Database operation failed. Please check server logs for details.'
        
        if (isConnError) {
          // Return 503 (Service Unavailable) for database connection issues
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Database connection failed. The database server is unreachable.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
            code: 'DATABASE_CONNECTION_ERROR',
            timestamp: new Date().toISOString()
          })
        }
        return serverError(res, 'Failed to list leads', errorDetails)
      }
    }

    // Create Lead (POST /api/leads)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'leads') {
      
      const body = req.body || {}
      
      if (!body.name) {
        return badRequest(res, 'name required')
      }

      // Check for duplicate clients/leads before creating
      try {
        const duplicateCheck = await checkForDuplicates(body)
        if (duplicateCheck && duplicateCheck.isDuplicate) {
          const errorMessage = formatDuplicateError(duplicateCheck) || duplicateCheck.message
          return badRequest(res, errorMessage)
        }
      } catch (dupError) {
        console.error('⚠️ Duplicate check failed, proceeding with creation:', dupError.message)
        // Don't block creation if duplicate check fails
      }

      // Build notes with additional fields that don't exist in schema
      let notes = body.notes || '';
      if (body.source) notes += `\nSource: ${body.source}`;
      if (body.stage) notes += `\nStage: ${body.stage}`;
      if (body.firstContactDate) notes += `\nFirst Contact: ${body.firstContactDate}`;

      // Ensure type column exists in database
      try {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`
      } catch (error) {
      }

      // Only include fields that exist in the database schema
      // CRITICAL: Always set type to lowercase 'lead' to ensure consistency
      // Ignore any type value from request body - leads must always be type='lead'
      const leadData = {
        name: String(body.name).trim(),
        type: 'lead', // Always lowercase 'lead' - never allow override (ignores body.type if present)
        industry: String(body.industry || 'Other').trim(),
        status: 'active',
        stage: String(body.stage || 'Awareness').trim(),
        revenue: (() => {
          const val = parseFloat(body.revenue)
          return isNaN(val) ? 0 : val
        })(),
        value: (() => {
          const val = parseFloat(body.value)
          return isNaN(val) ? 0 : val
        })(),
        probability: (() => {
          const val = parseInt(body.probability)
          return isNaN(val) ? 0 : val
        })(),
        lastContact: body.lastContact ? (() => {
          try {
            const date = new Date(body.lastContact)
            return isNaN(date.getTime()) ? new Date() : date
          } catch (e) {
            return new Date()
          }
        })() : new Date(),
        address: String(body.address || '').trim(),
        website: String(body.website || '').trim(),
        notes: String(notes).trim(),
        externalAgentId: body.externalAgentId || null
      }
      
      // Phase 2: Add JSON fields with dual-write (both String and JSONB)
      // Phase 5: Contacts/comments excluded - written to normalized tables only
      const jsonFields = prepareJsonFieldsForDualWrite(body)
      Object.assign(leadData, jsonFields)
      
      // Extract normalized fields from body before removing (will sync to normalized tables)
      let contactsToSync = []
      let commentsToSync = []
      let sitesToSync = []
      let contractsToSync = []
      let proposalsToSync = []
      let followUpsToSync = []
      let servicesToSync = []
      
      if (body.contacts !== undefined) {
        if (Array.isArray(body.contacts)) {
          contactsToSync = body.contacts
        } else if (typeof body.contacts === 'string' && body.contacts.trim()) {
          try {
            contactsToSync = JSON.parse(body.contacts)
          } catch (e) {
            contactsToSync = []
          }
        }
      }
      
      if (body.comments !== undefined) {
        if (Array.isArray(body.comments)) {
          commentsToSync = body.comments
        } else if (typeof body.comments === 'string' && body.comments.trim()) {
          try {
            commentsToSync = JSON.parse(body.comments)
          } catch (e) {
            commentsToSync = []
          }
        }
      }
      
      // Phase 6: Extract sites, contracts, proposals, followUps, services
      if (body.sites !== undefined) {
        if (Array.isArray(body.sites)) {
          sitesToSync = body.sites
        } else if (typeof body.sites === 'string' && body.sites.trim()) {
          try {
            sitesToSync = JSON.parse(body.sites)
          } catch (e) {
            sitesToSync = []
          }
        }
      }
      
      if (body.contracts !== undefined) {
        if (Array.isArray(body.contracts)) {
          contractsToSync = body.contracts
        } else if (typeof body.contracts === 'string' && body.contracts.trim()) {
          try {
            contractsToSync = JSON.parse(body.contracts)
          } catch (e) {
            contractsToSync = []
          }
        }
      }
      
      if (body.proposals !== undefined) {
        if (Array.isArray(body.proposals)) {
          proposalsToSync = body.proposals
        } else if (typeof body.proposals === 'string' && body.proposals.trim()) {
          try {
            proposalsToSync = JSON.parse(body.proposals)
          } catch (e) {
            proposalsToSync = []
          }
        }
      }
      
      if (body.followUps !== undefined) {
        if (Array.isArray(body.followUps)) {
          followUpsToSync = body.followUps
        } else if (typeof body.followUps === 'string' && body.followUps.trim()) {
          try {
            followUpsToSync = JSON.parse(body.followUps)
          } catch (e) {
            followUpsToSync = []
          }
        }
      }
      
      if (body.services !== undefined) {
        if (Array.isArray(body.services)) {
          servicesToSync = body.services
        } else if (typeof body.services === 'string' && body.services.trim()) {
          try {
            servicesToSync = JSON.parse(body.services)
          } catch (e) {
            servicesToSync = []
          }
        }
      }
      
      // Ensure normalized fields are NOT in leadData (they go to normalized tables only)
      delete leadData.contacts
      delete leadData.contactsJsonb
      delete leadData.comments
      delete leadData.commentsJsonb
      delete leadData.sites
      delete leadData.sitesJsonb
      delete leadData.contracts
      delete leadData.contractsJsonb
      delete leadData.proposals
      delete leadData.proposalsJsonb
      delete leadData.followUps
      delete leadData.followUpsJsonb
      delete leadData.services
      delete leadData.servicesJsonb


      // Filter out any undefined or null values that might cause issues
      Object.keys(leadData).forEach(key => {
        if (leadData[key] === undefined || leadData[key] === null) {
          delete leadData[key]
        }
      })

      // Only add ownerId if user is authenticated
      const userEmail = req.user?.email || 'unknown'
      const userId = req.user?.sub
      if (userId) {
        leadData.ownerId = userId
      }

      
      try {
        const lead = await prisma.client.create({
          data: leadData
        })
        
        
        // Phase 5: Sync contacts and comments to normalized tables after lead creation
        try {
          // Sync contacts if provided
          if (contactsToSync && Array.isArray(contactsToSync) && contactsToSync.length > 0) {
            // Use upsert for each contact to handle duplicate IDs
            for (const contact of contactsToSync) {
              // Convert contact ID to string for consistency with Prisma (which uses string IDs)
              const contactId = contact.id ? String(contact.id) : null
              
              const contactData = {
                clientId: lead.id,
                name: contact.name || '',
                email: contact.email || null,
                phone: contact.phone || null,
                mobile: contact.mobile || contact.phone || null,
                role: contact.role || null,
                title: contact.title || contact.department || null,
                isPrimary: !!contact.isPrimary,
                notes: contact.notes || ''
              }
              
              if (contactId) {
                try {
                  await prisma.clientContact.create({
                    data: {
                      id: contactId,
                      ...contactData
                    }
                  })
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientContact.update({
                      where: { id: contactId },
                      data: contactData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientContact.create({
                  data: contactData
                })
              }
            }
          }
          
          // Old code using createMany (replaced with upsert above):
          /* await prisma.clientContact.createMany({
              data: contactsToSync.map(contact => ({
                id: contact.id || undefined,
                clientId: lead.id,
                name: contact.name || '',
                email: contact.email || null,
                phone: contact.phone || null,
                mobile: contact.mobile || contact.phone || null,
                role: contact.role || null,
                title: contact.title || contact.department || null,
                isPrimary: !!contact.isPrimary,
                notes: contact.notes || ''
              }))
            }) */
          
          // Sync comments if provided
          if (commentsToSync && Array.isArray(commentsToSync) && commentsToSync.length > 0) {
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
            
            // Use upsert to handle duplicates
            for (const comment of commentsToSync) {
              // Map frontend field names (createdBy/createdById/createdByEmail) to database fields (author/authorId/userName)
              // Support both naming conventions for backward compatibility
              const commentData = {
                clientId: lead.id,
                text: comment.text || '',
                authorId: comment.authorId || comment.createdById || userId || null,
                author: comment.author || comment.createdBy || authorName || '',
                userName: comment.userName || comment.createdByEmail || userName || null,
                createdAt: comment.createdAt ? new Date(comment.createdAt) : undefined
              }
              
              if (comment.id) {
                try {
                  await prisma.clientComment.create({
                    data: {
                      id: comment.id,
                      ...commentData
                    }
                  })
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientComment.update({
                      where: { id: comment.id },
                      data: commentData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientComment.create({
                  data: commentData
                })
              }
            }
          }
          
          // Phase 6: Sync sites, contracts, proposals, followUps, services to normalized tables
          // Sync sites if provided
          if (sitesToSync && Array.isArray(sitesToSync) && sitesToSync.length > 0) {
            for (const site of sitesToSync) {
              const siteData = {
                clientId: lead.id,
                name: site.name || '',
                address: site.address || '',
                contactPerson: site.contactPerson || '',
                contactPhone: site.contactPhone || '',
                contactEmail: site.contactEmail || '',
                notes: site.notes || ''
              }
              
              if (site.id) {
                try {
                  await prisma.clientSite.create({
                    data: { id: site.id, ...siteData }
                  })
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientSite.update({
                      where: { id: site.id },
                      data: siteData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientSite.create({ data: siteData })
              }
            }
          }
          
          // Sync contracts if provided
          if (contractsToSync && Array.isArray(contractsToSync) && contractsToSync.length > 0) {
            for (const contract of contractsToSync) {
              const contractData = {
                clientId: lead.id,
                name: contract.name || '',
                size: contract.size || 0,
                type: contract.type || '',
                url: contract.url || '',
                uploadDate: contract.uploadDate ? new Date(contract.uploadDate) : new Date()
              }
              
              if (contract.id) {
                try {
                  await prisma.clientContract.create({
                    data: { id: contract.id, ...contractData }
                  })
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientContract.update({
                      where: { id: contract.id },
                      data: contractData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientContract.create({ data: contractData })
              }
            }
          }
          
          // Sync proposals if provided
          if (proposalsToSync && Array.isArray(proposalsToSync) && proposalsToSync.length > 0) {
            for (const proposal of proposalsToSync) {
              const proposalData = {
                clientId: lead.id,
                title: proposal.title || '',
                amount: proposal.amount || 0,
                status: proposal.status || 'Pending',
                workingDocumentLink: proposal.workingDocumentLink || '',
                createdDate: proposal.createdDate ? new Date(proposal.createdDate) : null,
                expiryDate: proposal.expiryDate ? new Date(proposal.expiryDate) : null,
                notes: proposal.notes || ''
              }
              
              if (proposal.id) {
                try {
                  await prisma.clientProposal.create({
                    data: { id: proposal.id, ...proposalData }
                  })
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientProposal.update({
                      where: { id: proposal.id },
                      data: proposalData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientProposal.create({ data: proposalData })
              }
            }
          }
          
          // Sync followUps if provided
          if (followUpsToSync && Array.isArray(followUpsToSync) && followUpsToSync.length > 0) {
            for (const followUp of followUpsToSync) {
              const followUpData = {
                clientId: lead.id,
                date: followUp.date || '',
                time: followUp.time || '',
                type: followUp.type || 'Call',
                description: followUp.description || '',
                completed: !!followUp.completed,
                assignedTo: followUp.assignedTo || null
              }
              
              if (followUp.id) {
                try {
                  await prisma.clientFollowUp.create({
                    data: { id: followUp.id, ...followUpData }
                  })
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientFollowUp.update({
                      where: { id: followUp.id },
                      data: followUpData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientFollowUp.create({ data: followUpData })
              }
            }
          }
          
          // Sync services if provided
          if (servicesToSync && Array.isArray(servicesToSync) && servicesToSync.length > 0) {
            for (const service of servicesToSync) {
              const serviceData = {
                clientId: lead.id,
                name: service.name || '',
                description: service.description || '',
                price: service.price || 0,
                status: service.status || 'Active',
                startDate: service.startDate ? new Date(service.startDate) : null,
                endDate: service.endDate ? new Date(service.endDate) : null,
                notes: service.notes || ''
              }
              
              if (service.id) {
                try {
                  await prisma.clientService.create({
                    data: { id: service.id, ...serviceData }
                  })
                } catch (createError) {
                  if (createError.code === 'P2002') {
                    await prisma.clientService.update({
                      where: { id: service.id },
                      data: serviceData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                await prisma.clientService.create({ data: serviceData })
              }
            }
          }
        } catch (syncError) {
          console.warn('⚠️ Failed to sync normalized data to tables (non-critical):', syncError.message)
          // Don't fail lead creation if sync fails
        }
        
        // VERIFY: Immediately re-query the database to confirm the lead exists and is queryable
        try {
          const verifyLead = await prisma.client.findUnique({ 
            where: { id: lead.id },
            select: { id: true, name: true, type: true, ownerId: true }
          })
          if (!verifyLead) {
            console.error(`❌ CRITICAL: Lead ${lead.id} was created but cannot be found on re-query!`)
          } else {
            
            // Also verify it's queryable by type filter
            const typeQueryResult = await prisma.client.findMany({
              where: { type: 'lead', id: lead.id },
              select: { id: true, name: true }
            })
            if (typeQueryResult.length === 0) {
              console.error(`❌ CRITICAL: Lead ${lead.id} exists but is NOT queryable by type='lead' filter!`)
              console.error(`   Lead type in database: "${verifyLead.type}"`)
            } else {
            }
          }
        } catch (verifyError) {
          console.error(`❌ Error verifying lead creation:`, verifyError.message)
        }
        
        // Parse JSON fields for response (same as GET endpoint)
        const parsedLead = parseClientJsonFields(lead)
        parsedLead.isStarred = false // StarredClient table doesn't exist
        
        
        return created(res, { lead: parsedLead })
      } catch (dbError) {
        console.error('❌ Database error creating lead:', dbError)
        console.error('❌ Database error details:', {
          code: dbError.code,
          meta: dbError.meta,
          message: dbError.message,
          stack: dbError.stack
        })
        console.error('❌ Lead data that failed:', leadData)
        return serverError(res, 'Failed to create lead', dbError.message)
      }
    }

    // Get, Update, Delete Single Lead (GET, PUT, DELETE /api/leads/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'leads' && id) {
      if (req.method === 'GET') {
        try {
          // Phase 3: Include normalized tables for lead detail
          // Phase 4: Include projects relation to derive projectIds
          const lead = await prisma.client.findFirst({ 
            where: { id, type: 'lead' },
            include: {
              clientContacts: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  mobile: true,
                  role: true,
                  title: true,
                  isPrimary: true,
                  notes: true
                },
                orderBy: {
                  isPrimary: 'desc',
                  createdAt: 'asc'
                }
              },
              clientComments: {
                select: {
                  id: true,
                  text: true,
                  author: true,
                  authorId: true,
                  userName: true,
                  createdAt: true
                },
                orderBy: {
                  createdAt: 'desc'
                }
              },
              projects: {
                select: {
                  id: true,
                  name: true,
                  status: true
                }
              }
            }
          })
          if (!lead) return notFound(res)
          
          // Phase 3: Parse using shared function which handles normalized tables
          const parsedLead = parseClientJsonFields(lead)
          return ok(res, { lead: parsedLead })
        } catch (dbError) {
          console.error('❌ Database error getting lead:', dbError)
          return serverError(res, 'Failed to get lead', dbError.message)
        }
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const body = req.body || {}
        
        // Check for duplicate clients/leads before updating (exclude current record)
        try {
          const duplicateCheck = await checkForDuplicates(body, id)
          if (duplicateCheck && duplicateCheck.isDuplicate) {
            const errorMessage = formatDuplicateError(duplicateCheck) || duplicateCheck.message
            return badRequest(res, errorMessage)
          }
        } catch (dupError) {
          console.error('⚠️ Duplicate check failed, proceeding with update:', dupError.message)
          // Don't block update if duplicate check fails
        }
        
        // Build updateData - only include fields that are actually provided in body
        const updateData = {
          type: 'lead' // Always preserve lead type to prevent conversion to client
        }
        
        // Only include fields if they're explicitly provided in the body
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
        // CRITICAL: Only use body.notes directly - don't build from source/stage as that overwrites user notes
        if (body.notes !== undefined) {
          updateData.notes = body.notes !== null ? String(body.notes) : ''
        }
      
      // Phase 2: Add JSON fields with dual-write (both String and JSONB)
      // Phase 5: Also sync contacts and comments to normalized tables
      // Phase 4: projectIds removed from jsonFields - use Project.clientId relation instead
      // Only include JSON fields if they're provided in the body
      const jsonFieldsToUpdate = {}
      const jsonFields = ['followUps', 'sites', 'contracts', 'activityLog', 'proposals', 'services']
      
      // Handle contacts separately to sync to normalized table
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
        
        // Phase 5: Sync to normalized ClientContact table
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
        } catch (contactSyncError) {
          console.error('❌ Failed to sync contacts to normalized table:', contactSyncError)
          // Don't throw - allow lead update to succeed even if contact sync fails
          // But log as error instead of warning so we can debug
        }
      }
      
      // Handle comments separately to sync to normalized table
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
        
        // Phase 5: Sync to normalized ClientComment table
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
              // User lookup failed
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
        } catch (commentSyncError) {
          console.warn('⚠️ Failed to sync comments to normalized table (non-critical):', commentSyncError.message)
        }
      }
      
      // Handle other JSON fields
      for (const field of jsonFields) {
        if (body[field] !== undefined) {
          let arrayValue = []
          if (Array.isArray(body[field])) {
            arrayValue = body[field]
          } else if (typeof body[field] === 'string' && body[field].trim()) {
            try {
              arrayValue = JSON.parse(body[field])
            } catch (e) {
              arrayValue = []
            }
          }
          
          jsonFieldsToUpdate[field] = JSON.stringify(arrayValue)
          jsonFieldsToUpdate[`${field}Jsonb`] = arrayValue
        }
      }
      
      // Phase 4: Handle projectIds as deprecated field (backward compatibility only)
      // Projects should be managed via Project.clientId relation, not JSON array
      if (body.projectIds !== undefined) {
        let projectIdsArray = []
        if (Array.isArray(body.projectIds)) {
          projectIdsArray = body.projectIds
        } else if (typeof body.projectIds === 'string' && body.projectIds.trim()) {
          try {
            projectIdsArray = JSON.parse(body.projectIds)
          } catch (e) {
            projectIdsArray = []
          }
        }
        // Only write to String field (deprecated, no JSONB)
        jsonFieldsToUpdate.projectIds = JSON.stringify(projectIdsArray)
        console.warn(`⚠️ projectIds field is deprecated. Use Project.clientId relation instead.`)
      }
      
      // Handle billingTerms separately (object, not array)
      if (body.billingTerms !== undefined) {
        let billingTermsObj = DEFAULT_BILLING_TERMS
        if (typeof body.billingTerms === 'object' && body.billingTerms !== null) {
          billingTermsObj = { ...DEFAULT_BILLING_TERMS, ...body.billingTerms }
        } else if (typeof body.billingTerms === 'string' && body.billingTerms.trim()) {
          try {
            billingTermsObj = { ...DEFAULT_BILLING_TERMS, ...JSON.parse(body.billingTerms) }
          } catch (e) {
            billingTermsObj = DEFAULT_BILLING_TERMS
          }
        }
        jsonFieldsToUpdate.billingTerms = JSON.stringify(billingTermsObj)
        jsonFieldsToUpdate.billingTermsJsonb = billingTermsObj
      }
      
      // Merge JSON fields into updateData
      Object.assign(updateData, jsonFieldsToUpdate)
      
      // Handle externalAgentId separately
      if (body.externalAgentId !== undefined) {
        updateData.externalAgentId = body.externalAgentId || null
      }
      
      // Debug logging for externalAgentId
      if (body.externalAgentId !== undefined) {
        console.log('📥 Received externalAgentId in update request:', body.externalAgentId, '→', updateData.externalAgentId);
      }
      
      // Debug logging to verify updateData is constructed correctly
      console.log(`📝 [LEADS] Update data for lead ${id}:`, JSON.stringify(updateData, null, 2))
      console.log(`📝 [LEADS] Fields in body:`, Object.keys(body || {}))
      
      // Check if updateData is empty (only has type) - this would mean no fields were provided
      if (Object.keys(updateData).length === 1 && updateData.type) {
        console.warn(`⚠️ [LEADS] Update data is empty (only type field) - no fields to update for lead ${id}`)
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
            externalAgent: true
          }
        })
        if (!existing) {
          return notFound(res)
        }
        const parsedLead = parseClientJsonFields(existing)
        return ok(res, { lead: parsedLead })
      }
        
      try {
          // First verify the lead exists and is actually a lead
          const existing = await prisma.client.findUnique({ where: { id } })
          if (!existing) {
            console.error('❌ Lead not found:', id)
            return notFound(res)
          }
          if (existing.type !== 'lead') {
            console.error('❌ Record is not a lead:', id, 'type:', existing.type)
            return badRequest(res, 'Not a lead')
          }
          
          // Now update it
          const lead = await prisma.client.update({ 
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
              externalAgent: true
            }
          })
          
        // CRITICAL DEBUG: Immediately re-query database to verify persistence
        const verifyLead = await prisma.client.findUnique({ where: { id } })
        if (updateData.status !== undefined && verifyLead.status !== updateData.status) {
          console.error('❌ CRITICAL: Database did not persist status change!')
          console.error('   Expected:', updateData.status, 'Got:', verifyLead.status)
        }
        
        // Verify externalAgentId was persisted correctly
        if (body.externalAgentId !== undefined) {
          const expectedExternalAgentId = body.externalAgentId || null;
          const actualExternalAgentId = verifyLead.externalAgentId || null;
          if (expectedExternalAgentId !== actualExternalAgentId) {
            console.error('❌ CRITICAL: Database did not persist externalAgentId change!')
            console.error('   Expected:', expectedExternalAgentId, 'Got:', actualExternalAgentId)
          } else {
            console.log('✅ externalAgentId persisted correctly:', actualExternalAgentId);
          }
        }
        
        // Parse JSON fields before returning using shared utility
        const parsedLead = parseClientJsonFields(lead)
        
        return ok(res, { lead: parsedLead })
        } catch (dbError) {
          console.error('❌ Database error updating lead:', dbError)
          console.error('❌ Error details:', dbError.code, dbError.meta)
          return serverError(res, 'Failed to update lead', dbError.message)
        }
      }
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
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting lead:', dbError)
          return serverError(res, 'Failed to delete lead', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or lead action')
  } catch (e) {
    // Log full error details for debugging
    console.error('❌ Lead handler top-level error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      meta: e.meta,
      stack: e.stack?.substring(0, 1000),
      url: req.url,
      method: req.method,
      user: req.user?.sub || 'none'
    })
    
    // Check for database connection errors
    const isConnectionError = e.message?.includes("Can't reach database server") ||
                             e.code === 'P1001' ||
                             e.code === 'P1002' ||
                             e.code === 'P1008' ||
                             e.code === 'P1017' ||
                             e.code === 'ETIMEDOUT' ||
                             e.code === 'ECONNREFUSED' ||
                             e.code === 'ENOTFOUND' ||
                             e.name === 'PrismaClientInitializationError'
    
    if (isConnectionError) {
      return serverError(res, 'Database connection failed', `Unable to connect to database: ${e.message}`)
    }
    
    // Check for Prisma schema errors (table/column missing)
    if (e.code === 'P2001' || e.code === 'P2025' || e.message?.includes('does not exist') || e.message?.toLowerCase().includes('relation') || e.message?.toLowerCase().includes('column')) {
      return serverError(res, 'Database schema error', `Schema issue detected: ${e.message}. Please check server logs.`)
    }
    
    // Return detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Lead handler failed: ${e.message}` 
      : 'Failed to process request'
    
    return serverError(res, errorMessage, e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
