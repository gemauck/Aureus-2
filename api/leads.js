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
              }
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
      const jsonFields = prepareJsonFieldsForDualWrite(body)
      Object.assign(leadData, jsonFields)


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
        
        // Build notes with additional fields that don't exist in schema (if provided)
        let notes = body.notes || '';
        if (body.source && !notes.includes('Source:')) notes += `\nSource: ${body.source}`;
        if (body.stage && !notes.includes('Stage:')) notes += `\nStage: ${body.stage}`;
        
        const updateData = {
          name: body.name,
          type: 'lead', // Explicitly preserve lead type to prevent conversion to client
          industry: body.industry,
          status: 'active', // Status is always 'active', hardcoded
          stage: body.stage, // Stage IS in database schema
          revenue: body.revenue !== undefined ? parseFloat(body.revenue) || 0 : undefined,
          value: body.value !== undefined ? parseFloat(body.value) || 0 : undefined,
          probability: body.probability !== undefined ? parseInt(body.probability) || 0 : undefined,
          lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
          address: body.address,
          website: body.website,
          notes: notes || undefined
      }
      
      // Phase 2: Add JSON fields with dual-write (both String and JSONB)
      // Phase 4: projectIds removed from jsonFields - use Project.clientId relation instead
      // Only include JSON fields if they're provided in the body
      const jsonFieldsToUpdate = {}
      const jsonFields = ['contacts', 'followUps', 'comments', 'sites', 'contracts', 'activityLog', 'proposals', 'services']
      
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
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })
        
        // Ensure externalAgentId is included even if null (to allow clearing it)
        if (body.externalAgentId !== undefined && !('externalAgentId' in updateData)) {
          updateData.externalAgentId = body.externalAgentId || null;
          console.log('🔧 Added externalAgentId to updateData:', updateData.externalAgentId);
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
          data: updateData 
          })
          
        // CRITICAL DEBUG: Immediately re-query database to verify persistence
        const verifyLead = await prisma.client.findUnique({ where: { id } })
        if (verifyLead.status !== updateData.status) {
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
        
        return ok(res, { lead })
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
