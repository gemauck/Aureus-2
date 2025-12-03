import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { checkForDuplicates, formatDuplicateError } from './_lib/duplicateValidation.js'

// Helper function to parse JSON fields from database responses
// PERFORMANCE: Optimized JSON parsing - only parse what's needed
const DEFAULT_BILLING_TERMS = {
  paymentTerms: 'Net 30',
  billingFrequency: 'Monthly',
  currency: 'ZAR',
  retainerAmount: 0,
  taxExempt: false,
  notes: ''
}

function parseClientJsonFields(client) {
  try {
    const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
    const parsed = { ...client }
    
    // Optimized: Parse JSON fields with minimal error handling overhead
    for (const field of jsonFields) {
      const value = parsed[field]
      
      if (typeof value === 'string' && value) {
        try {
          parsed[field] = JSON.parse(value)
        } catch (e) {
          // Set safe defaults on parse error
          parsed[field] = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : []
        }
      } else if (!value) {
        // Set defaults for missing/null fields
        parsed[field] = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : []
      }
      // If already an object/array, keep as-is (already parsed)
    }
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing client ${client.id}:`, error.message)
    // Return client as-is if parsing fails completely
    return client
  }
}

async function handler(req, res) {
  try {
    // Parse the URL path - strip /api/ prefix if present
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // For /api/clients/[id]

    // List Clients (GET /api/clients)
    if (req.method === 'GET' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      try {
        
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
        
        // Try query with type filter first, fallback to all clients if type column doesn't exist
        let rawClients
        try {
          
          // Query clients directly using Prisma (we confirmed there are no NULL types, all are 'client' or 'lead')
          // Use defensive includes - if relations fail, try without them
          try {
            rawClients = await prisma.client.findMany({
              where: {
                type: 'client'
              },
              include: {
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
              },
              orderBy: {
                createdAt: 'desc'
              }
            })
          } catch (relationError) {
            // If relations fail, try query with minimal relations (still include groupMemberships)
            console.warn('⚠️ Query with relations failed, trying with minimal relations:', relationError.message)
            try {
              rawClients = await prisma.client.findMany({
                where: {
                  type: 'client'
                },
                include: {
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
                },
                orderBy: {
                  createdAt: 'desc'
                }
              })
            } catch (minimalRelationError) {
              // Last resort: query without relations but log the error
              console.error('❌ Minimal relations query also failed, using query without relations:', minimalRelationError.message)
              rawClients = await prisma.client.findMany({
                where: {
                  type: 'client'
                },
                orderBy: {
                  createdAt: 'desc'
                }
              })
              // Manually set empty groupMemberships for all clients
              rawClients = rawClients.map(client => ({
                ...client,
                groupMemberships: []
              }))
            }
          }
        } catch (typeError) {
          // If type column doesn't exist or query fails, try without type filter
          console.error('❌ Type filter failed, trying without filter:', typeError.message)
          console.error('❌ Type error stack:', typeError.stack)
          
          // Note: validUserId is already set above, no need to reset it
          
          // Also check total count for debugging
          try {
            const totalCount = await prisma.client.count()
          } catch (countError) {
            console.warn('⚠️ Count query failed:', countError.message)
          }
          
          // IMPORTANT: Return ALL clients regardless of ownerId - all users should see all clients
          try {
            rawClients = await prisma.client.findMany({
              include: {
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
              },
              orderBy: {
                createdAt: 'desc'
              }
              // No WHERE clause filtering by ownerId - all users see all clients
            })
            // Filter manually in case type column doesn't exist in DB but we want to exclude leads
            rawClients = rawClients.filter(c => !c.type || c.type === 'client' || c.type === null)
          } catch (fallbackError) {
            // Last resort: query without any relations
            console.error('❌ Fallback query with relations failed, trying minimal query:', fallbackError.message)
            rawClients = await prisma.client.findMany({
              include: {
                parentGroup: {
                  select: {
                    id: true,
                    name: true,
                    type: true
                  }
                },
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
              },
              orderBy: {
                createdAt: 'desc'
              }
            })
            // Filter manually and add empty tags
            rawClients = rawClients
              .filter(c => !c.type || c.type === 'client' || c.type === null)
          }
        }
        
        // Prisma returns objects with relations - parse JSON fields
        const clients = rawClients
        
        
        // DEBUG: Also check raw SQL to verify what's actually in database
        try {
          const rawClientsSQL = await prisma.$queryRaw`
            SELECT id, name, type, "ownerId", "createdAt"
            FROM "Client"
            WHERE (type = 'client' OR type IS NULL)
            AND type != 'lead'
            ORDER BY "createdAt" DESC
          `
          if (rawClientsSQL.length > 0) {
          }
          
          // Compare counts
          if (rawClientsSQL.length !== clients.length) {
            console.error(`❌ MISMATCH: Prisma query returned ${clients.length} clients, but raw SQL returned ${rawClientsSQL.length} clients!`)
            
            // Find which clients are missing
            const prismaIds = new Set(clients.map(c => c.id))
            const missingClients = rawClientsSQL.filter(rc => !prismaIds.has(rc.id))
            if (missingClients.length > 0) {
              console.error(`❌ Missing clients from Prisma query:`, JSON.stringify(missingClients, null, 2))
            }
          }
        } catch (sqlError) {
          console.warn('⚠️ Raw SQL query failed (non-critical):', sqlError.message)
        }
        
        // Log client details for debugging visibility issues
        if (clients.length > 0) {
          const clientDetails = clients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId || 'null', type: c.type || 'null' }))
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
        
        // Parse JSON fields before returning and add starred status
        const parsedClients = clients.map(client => {
          const parsed = parseClientJsonFields(client)
          // Check if current user has starred this client
          parsed.isStarred = validUserId && client.starredBy && Array.isArray(client.starredBy) && client.starredBy.length > 0
          
          // Preserve group data (groupMemberships are objects, not JSON strings)
          // These come from Prisma relations and should be preserved as-is
          const rawGroupMemberships = client.groupMemberships || parsed.groupMemberships
          if (rawGroupMemberships && Array.isArray(rawGroupMemberships)) {
            parsed.groupMemberships = rawGroupMemberships
          } else {
            parsed.groupMemberships = []
          }
          
          // CRITICAL: Ensure group data is always present (even if null/undefined, set to empty array for JSON serialization)
          if (!parsed.groupMemberships) {
            parsed.groupMemberships = []
          }
          
          return parsed
        })
        
        // Final verification: Log response before sending
        if (parsedClients.length > 0) {
        }
        
        // CRITICAL: Double-check that we're not filtering by ownerId
        // Log database connection info to verify we're querying the same database
        try {
          const dbInfo = await prisma.$queryRaw`SELECT current_database() as db_name, current_user as db_user`
          
          // Also test a direct count query
          const directCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Client" WHERE type = 'client'`
          
          // Test Prisma count
          const prismaCount = await prisma.client.count({ where: { type: 'client' } })
        } catch (e) {
          console.warn('⚠️ Could not get database info:', e.message)
        }
        
        // Add cache-busting headers to prevent browser caching
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
        
        
        return ok(res, { clients: parsedClients })
      } catch (dbError) {
        // Log the error immediately with full details
        console.error('❌ Database error in GET /api/clients:', {
          message: dbError.message,
          name: dbError.name,
          code: dbError.code,
          meta: dbError.meta,
          stack: dbError.stack?.substring(0, 1000),
          url: req.url,
          method: req.method
        })
        
        // Check if it's a connection error
        const isConnectionError = dbError.message?.includes("Can't reach database server") ||
                                 dbError.code === 'P1001' ||
                                 dbError.code === 'P1002' ||
                                 dbError.code === 'P1008' ||
                                 dbError.code === 'P1017' ||
                                 dbError.code === 'ETIMEDOUT' ||
                                 dbError.code === 'ECONNREFUSED' ||
                                 dbError.code === 'ENOTFOUND' ||
                                 dbError.name === 'PrismaClientInitializationError'
        
        if (isConnectionError) {
          console.error('🔌 Database connection issue detected - server may be unreachable')
          console.error('   Error details:', {
            code: dbError.code,
            message: dbError.message,
            name: dbError.name
          })
        }
        
        // Return detailed error for debugging (include error code and message)
        const errorDetails = process.env.NODE_ENV === 'development' 
          ? `${dbError.message || 'Unknown database error'} (Code: ${dbError.code || 'N/A'})`
          : 'Database connection failed. Please check server logs for details.'
        
        return serverError(res, 'Failed to list clients', errorDetails)
      }
    }

    // Create Client (POST /api/clients)
    if (req.method === 'POST' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'name required')

      // Check for duplicate clients/leads before creating
      // NOTE: This is now non‑blocking – we always continue to create
      // the client, but we include any duplicates in the response so
      // the UI can show a warning instead of a hard error.
      let duplicateCheck = null
      try {
        duplicateCheck = await checkForDuplicates(body)
      } catch (dupError) {
        console.error('⚠️ Duplicate check failed, proceeding with creation:', dupError.message)
        // Don't block creation if duplicate check fails
      }

      // Schema modifications should be handled by migrations, not in request handlers
      // The type and services columns are defined in Prisma schema and should already exist

      // Verify user exists before setting ownerId
      const userEmail = req.user?.email || 'unknown'
      const userId = req.user?.sub
      let ownerId = null;
      if (userId) {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            ownerId = userId;
          }
        } catch (userError) {
          // Skip ownerId if error
        }
      }

      // CRITICAL: Always set type to 'client' for client creation (ignore body.type if present for leads)
      const clientData = {
        name: body.name,
        type: 'client', // Always 'client' for client creation - never allow override
        industry: body.industry || 'Other',
        status: body.status || 'active',
        revenue: parseFloat(body.revenue) || 0,
        value: parseFloat(body.value) || 0, // Add value field
        probability: parseInt(body.probability) || 0, // Add probability field
        lastContact: body.lastContact ? new Date(body.lastContact) : new Date(),
        address: body.address || '',
        website: body.website || '',
        notes: body.notes || '',
        contacts: JSON.stringify(Array.isArray(body.contacts) ? body.contacts : []),
        followUps: JSON.stringify(Array.isArray(body.followUps) ? body.followUps : []),
        projectIds: JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : []),
        comments: JSON.stringify(Array.isArray(body.comments) ? body.comments : []),
        sites: JSON.stringify(Array.isArray(body.sites) ? body.sites : []),
        contracts: JSON.stringify(Array.isArray(body.contracts) ? body.contracts : []),
        activityLog: JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : []),
        services: JSON.stringify(Array.isArray(body.services) ? body.services : []),
            billingTerms: JSON.stringify(typeof body.billingTerms === 'object' ? body.billingTerms : {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        }),
        ...(ownerId ? { ownerId } : {})
      }

      
      // Ensure industry exists in Industry table before creating client
      if (clientData.industry && clientData.industry.trim()) {
        const industryName = clientData.industry.trim()
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
          // Don't block the client creation if industry sync fails
          console.warn('⚠️ Error syncing industry:', industryError.message)
        }
      }
      
      try {
        const client = await prisma.client.create({
          data: {
            name: clientData.name,
            type: clientData.type, // Always 'client'
            industry: clientData.industry,
            status: clientData.status,
            revenue: clientData.revenue,
            value: clientData.value,
            probability: clientData.probability,
            lastContact: clientData.lastContact,
            address: clientData.address,
            website: clientData.website,
            notes: clientData.notes,
            contacts: Array.isArray(clientData.contacts) ? JSON.stringify(clientData.contacts) : (typeof clientData.contacts === 'string' ? clientData.contacts : '[]'),
            followUps: Array.isArray(clientData.followUps) ? JSON.stringify(clientData.followUps) : (typeof clientData.followUps === 'string' ? clientData.followUps : '[]'),
            projectIds: Array.isArray(clientData.projectIds) ? JSON.stringify(clientData.projectIds) : (typeof clientData.projectIds === 'string' ? clientData.projectIds : '[]'),
            comments: Array.isArray(clientData.comments) ? JSON.stringify(clientData.comments) : (typeof clientData.comments === 'string' ? clientData.comments : '[]'),
            sites: Array.isArray(clientData.sites) ? JSON.stringify(clientData.sites) : (typeof clientData.sites === 'string' ? clientData.sites : '[]'),
            contracts: Array.isArray(clientData.contracts) ? JSON.stringify(clientData.contracts) : (typeof clientData.contracts === 'string' ? clientData.contracts : '[]'),
            activityLog: Array.isArray(clientData.activityLog) ? JSON.stringify(clientData.activityLog) : (typeof clientData.activityLog === 'string' ? clientData.activityLog : '[]'),
            services: Array.isArray(clientData.services) ? JSON.stringify(clientData.services) : (typeof clientData.services === 'string' ? clientData.services : '[]'),
            billingTerms: typeof clientData.billingTerms === 'object' ? JSON.stringify(clientData.billingTerms) : (typeof clientData.billingTerms === 'string' ? clientData.billingTerms : '{}'),
            ...(ownerId ? { ownerId } : {})
          }
        })
        
        
        // VERIFY: Immediately re-query the database to confirm the client exists and is queryable
        try {
          const verifyClient = await prisma.client.findUnique({ 
            where: { id: client.id },
            select: { id: true, name: true, type: true, ownerId: true }
          })
          if (!verifyClient) {
            console.error(`❌ CRITICAL: Client ${client.id} was created but cannot be found on re-query!`)
          } else {
            
            // Also verify it's queryable by type filter
            const typeQueryResult = await prisma.client.findMany({
              where: { 
                OR: [
                  { type: 'client' },
                  { type: null }
                ],
                id: client.id
              },
              select: { id: true, name: true }
            })
            if (typeQueryResult.length === 0) {
              console.error(`❌ CRITICAL: Client ${client.id} exists but is NOT queryable by type='client' filter!`)
              console.error(`   Client type in database: "${verifyClient.type}"`)
            } else {
            }
          }
        } catch (verifyError) {
          console.error(`❌ Error verifying client creation:`, verifyError.message)
        }
        
        // Parse JSON fields before returning
        const parsedClient = parseClientJsonFields(client)
        
        
        // Attach duplicate info (if any) so frontend can show a warning
        return created(res, { client: parsedClient, duplicateWarning: duplicateCheck })
      } catch (dbError) {
        console.error('❌ Database error creating client:', dbError)
        return serverError(res, 'Failed to create client', dbError.message)
      }
    }

    // Get, Update, Delete Single Client (GET, PATCH, DELETE /api/clients/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'clients' && id) {
      if (req.method === 'GET') {
        try {
          const userId = req.user?.sub
          let validUserId = null
          if (userId) {
            try {
              const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
              if (userExists) {
                validUserId = userId
              }
            } catch (userCheckError) {
              // User doesn't exist, skip starredBy relation
            }
          }
          
          const client = await prisma.client.findUnique({ 
            where: { id },
            include: {
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
          })
          if (!client) return notFound(res)
          // Parse JSON fields before returning
          const parsedClient = parseClientJsonFields(client)
          // Check if current user has starred this client
          parsedClient.isStarred = validUserId && client.starredBy && Array.isArray(client.starredBy) && client.starredBy.length > 0
          return ok(res, { client: parsedClient })
        } catch (dbError) {
          console.error('❌ Database error getting client:', dbError)
          return serverError(res, 'Failed to get client', dbError.message)
        }
      }
      if (req.method === 'PATCH') {
        const body = req.body || {}
        
        // First verify this is actually a client (not a lead being updated through wrong endpoint)
        const existing = await prisma.client.findUnique({ where: { id } })
        if (existing && existing.type === 'lead') {
          return badRequest(res, 'Cannot update lead through clients endpoint')
        }
        
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
        
        // Ensure services is always included, even if not provided in body
        const servicesValue = body.services !== undefined 
          ? (typeof body.services === 'string' ? body.services : JSON.stringify(Array.isArray(body.services) ? body.services : []))
          : JSON.stringify([])
        
        
        const updateData = {
          name: body.name,
          type: body.type || 'client', // Default to 'client' to prevent null types
          industry: body.industry,
          status: body.status,
          revenue: body.revenue,
          value: body.value, // Add value field
          probability: body.probability, // Add probability field
          lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
          address: body.address,
          website: body.website,
          notes: body.notes,
          contacts: typeof body.contacts === 'string' ? body.contacts : JSON.stringify(Array.isArray(body.contacts) ? body.contacts : []),
          followUps: typeof body.followUps === 'string' ? body.followUps : JSON.stringify(Array.isArray(body.followUps) ? body.followUps : []),
          projectIds: typeof body.projectIds === 'string' ? body.projectIds : JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : []),
          comments: typeof body.comments === 'string' ? body.comments : JSON.stringify(Array.isArray(body.comments) ? body.comments : []),
          sites: typeof body.sites === 'string' ? body.sites : JSON.stringify(Array.isArray(body.sites) ? body.sites : []),
          contracts: typeof body.contracts === 'string' ? body.contracts : JSON.stringify(Array.isArray(body.contracts) ? body.contracts : []),
          activityLog: typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : []),
          services: servicesValue, // Always include services
          billingTerms: typeof body.billingTerms === 'string' ? body.billingTerms : JSON.stringify(typeof body.billingTerms === 'object' && body.billingTerms !== null ? body.billingTerms : {})
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        try {
          const client = await prisma.client.update({ where: { id }, data: updateData })
          // Parse JSON fields before returning
          const parsedClient = parseClientJsonFields(client)
          return ok(res, { client: parsedClient })
        } catch (dbError) {
          console.error('❌ Database error updating client:', dbError)
          return serverError(res, 'Failed to update client', dbError.message)
        }
      }
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
          
          // Update projects to remove client reference (set clientId to null)
          const projectsUpdated = await prisma.project.updateMany({
            where: { clientId: id },
            data: { clientId: null }
          })
          
          // Now delete the client
          await prisma.client.delete({ where: { id } })
          return ok(res, { 
            deleted: true, 
            message: `Client deleted successfully. Also deleted ${opportunitiesDeleted.count} opportunities, ${invoicesDeleted.count} invoices, and updated ${projectsUpdated.count} projects.`
          })
        } catch (dbError) {
          console.error('❌ Database error deleting client:', dbError)
          return serverError(res, 'Failed to delete client', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or client action')
  } catch (e) {
    // Log full error details for debugging
    console.error('❌ Client handler top-level error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      stack: e.stack?.substring(0, 1000),
      url: req.url,
      method: req.method
    })
    
    // Check for database connection errors
    const isConnectionError = e.message?.includes("Can't reach database server") ||
                             e.code === 'P1001' ||
                             e.code === 'ETIMEDOUT' ||
                             e.code === 'ECONNREFUSED' ||
                             e.code === 'ENOTFOUND'
    
    if (isConnectionError) {
      return serverError(res, 'Database connection failed', `Unable to connect to database: ${e.message}`)
    }
    
    return serverError(res, 'Client handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))