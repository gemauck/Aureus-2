import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
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
        
        // Try query with type filter first, fallback to all clients if type column doesn't exist
        let rawClients
        try {
          
          // Query clients directly using Prisma - include both 'client' type and NULL types (legacy clients)
          // Use defensive includes - if relations fail, try without them
          try {
            rawClients = await prisma.client.findMany({
              where: {
                OR: [
                  { type: 'client' },
                  { type: 'group' },
                  { type: null }
                ]
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
                    notes: true,
                    createdAt: true
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
              orderBy: {
                createdAt: 'desc'
              }
            })
            
            // If table doesn't exist, manually set empty groupMemberships
            if (!hasGroupMembershipsTable) {
              rawClients = rawClients.map(client => ({
                ...client,
                groupMemberships: []
              }))
            }
          } catch (relationError) {
            // If relations fail, try query with minimal relations (still include groupMemberships)
            console.warn('⚠️ Query with relations failed:', {
              message: relationError.message,
              code: relationError.code,
              meta: relationError.meta
            })
            console.warn('⚠️ Trying with minimal relations...')
            try {
              rawClients = await prisma.client.findMany({
                where: {
                  OR: [
                    { type: 'client' },
                    { type: 'group' },
                    { type: null }
                  ]
                },
                include: {
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
                orderBy: {
                  createdAt: 'desc'
                }
              })
              
              // If table doesn't exist, manually set empty groupMemberships
              if (!hasGroupMembershipsTable) {
                rawClients = rawClients.map(client => ({
                  ...client,
                  groupMemberships: []
                }))
              }
            } catch (minimalRelationError) {
              // Last resort: query without relations but log the error
              console.error('❌ Minimal relations query also failed:', {
                message: minimalRelationError.message,
                code: minimalRelationError.code,
                meta: minimalRelationError.meta,
                stack: minimalRelationError.stack?.substring(0, 500)
              })
              
              try {
                rawClients = await prisma.client.findMany({
                  where: {
                    OR: [
                      { type: 'client' },
                      { type: null }
                    ]
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
              } catch (basicQueryError) {
                // Even the basic query failed - log full error and re-throw
                console.error('❌ Basic query failed (no relations):', {
                  message: basicQueryError.message,
                  code: basicQueryError.code,
                  meta: basicQueryError.meta,
                  stack: basicQueryError.stack?.substring(0, 500),
                  url: req.url,
                  method: req.method
                })
                throw basicQueryError // Re-throw to be caught by outer catch block
              }
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
            // Check if error is about missing column (like parentGroupId)
            const isMissingColumnError = fallbackError.code === 'P2022' || 
                                       fallbackError.message?.includes('does not exist') ||
                                       fallbackError.message?.includes('parentGroupId')
            if (isMissingColumnError) {
              // Use raw SQL query to avoid Prisma schema validation issues with missing columns
              console.warn('⚠️ Column missing error detected, using raw SQL query to bypass Prisma validation')
              try {
                const allRecordsRaw = await prisma.$queryRaw`
                  SELECT id, name, type, industry, status, stage, revenue, value, probability, 
                         "lastContact", address, website, notes, contacts, "followUps", 
                         "projectIds", comments, sites, contracts, "activityLog", 
                         "billingTerms", "ownerId", "externalAgentId", "createdAt", "updatedAt",
                         proposals, thumbnail, services, "rssSubscribed"
                  FROM "Client"
                  WHERE (type = 'client' OR type = 'group' OR type IS NULL)
                  AND type != 'lead'
                  ORDER BY "createdAt" DESC
                `
                rawClients = allRecordsRaw.map(record => {
                  const parsed = parseClientJsonFields(record)
                  return {
                    ...parsed,
                    groupMemberships: []
                  }
                })
              } catch (rawSqlError) {
                console.error('❌ Raw SQL query also failed:', rawSqlError.message)
                throw rawSqlError
              }
            } else {
              rawClients = await prisma.client.findMany({
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
              // Filter manually and add empty tags
              rawClients = rawClients
                .filter(c => !c.type || c.type === 'client' || c.type === 'group' || c.type === null)
            }
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
          // Return 503 (Service Unavailable) for database connection issues
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Database connection failed. The database server is unreachable.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
            code: 'DATABASE_CONNECTION_ERROR',
            timestamp: new Date().toISOString()
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
      // Phase 2: Prepare JSON fields for dual-write (both String and JSONB)
      const jsonFields = prepareJsonFieldsForDualWrite(body)
      
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
        // Phase 2: Dual-write - both String (backward compatibility) and JSONB (new)
        ...jsonFields,
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
        // Phase 2: Dual-write - Create with both String and JSONB fields
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
            // Phase 5: Contacts/comments are written to normalized tables ONLY - no JSON writes
            // Removed: contacts, contactsJsonb, comments, commentsJsonb
            followUps: clientData.followUps || '[]',
            followUpsJsonb: clientData.followUpsJsonb || [],
            // Phase 4: projectIds deprecated - projects managed via Project.clientId relation
            // Still include for backward compatibility if provided, but prefer Project.clientId
            projectIds: clientData.projectIds || '[]',
            sites: clientData.sites || '[]',
            sitesJsonb: clientData.sitesJsonb || [],
            contracts: clientData.contracts || '[]',
            contractsJsonb: clientData.contractsJsonb || [],
            activityLog: clientData.activityLog || '[]',
            activityLogJsonb: clientData.activityLogJsonb || [],
            proposals: clientData.proposals || '[]',
            proposalsJsonb: clientData.proposalsJsonb || [],
            services: clientData.services || '[]',
            servicesJsonb: clientData.servicesJsonb || [],
            billingTerms: clientData.billingTerms || JSON.stringify(DEFAULT_BILLING_TERMS),
            billingTermsJsonb: clientData.billingTermsJsonb || DEFAULT_BILLING_TERMS,
            ...(ownerId ? { ownerId } : {})
          }
        })
        
        
        // Phase 5: Sync contacts and comments to normalized tables after client creation
        try {
          // Sync contacts if provided - use upsert to handle duplicates
          if (clientData.contactsJsonb && Array.isArray(clientData.contactsJsonb) && clientData.contactsJsonb.length > 0) {
            for (const contact of clientData.contactsJsonb) {
              const contactData = {
                clientId: client.id,
                name: contact.name || '',
                email: contact.email || null,
                phone: contact.phone || null,
                mobile: contact.mobile || contact.phone || null,
                role: contact.role || null,
                title: contact.title || contact.department || null,
                isPrimary: !!contact.isPrimary,
                notes: contact.notes || ''
              }
              
              if (contact.id) {
                // Use upsert for contacts with IDs to handle duplicates
                try {
                  await prisma.clientContact.create({
                    data: {
                      id: contact.id,
                      ...contactData
                    }
                  })
                } catch (createError) {
                  // If ID conflict, update instead
                  if (createError.code === 'P2002') {
                    await prisma.clientContact.update({
                      where: { id: contact.id },
                      data: contactData
                    })
                  } else {
                    throw createError
                  }
                }
              } else {
                // Create without ID (Prisma generates one)
                await prisma.clientContact.create({
                  data: contactData
                })
              }
            }
          }
          
          // Sync comments if provided - use upsert to handle duplicates
          if (clientData.commentsJsonb && Array.isArray(clientData.commentsJsonb) && clientData.commentsJsonb.length > 0) {
            const userId = ownerId || null
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
            
            for (const comment of clientData.commentsJsonb) {
              const commentData = {
                clientId: client.id,
                text: comment.text || '',
                authorId: comment.authorId || userId || null,
                author: comment.author || authorName || '',
                userName: comment.userName || userName || null,
                createdAt: comment.createdAt ? new Date(comment.createdAt) : undefined
              }
              
              if (comment.id) {
                // Use upsert for comments with IDs to handle duplicates
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
                // Create without ID (Prisma generates one)
                await prisma.clientComment.create({
                  data: commentData
                })
              }
            }
          }
        } catch (syncError) {
          console.warn('⚠️ Failed to sync contacts/comments to normalized tables (non-critical):', syncError.message)
          // Don't fail client creation if sync fails
        }
        
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
        
        // Phase 2: Prepare update data with dual-write support
        // Only include fields that are provided in the body
        const updateData = {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.type !== undefined && { type: body.type || 'client' }), // Default to 'client' to prevent null types
          ...(body.industry !== undefined && { industry: body.industry }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.revenue !== undefined && { revenue: body.revenue }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.probability !== undefined && { probability: body.probability }),
          ...(body.lastContact !== undefined && { lastContact: body.lastContact ? new Date(body.lastContact) : undefined }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.website !== undefined && { website: body.website }),
          ...(body.notes !== undefined && { notes: body.notes })
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
            // Delete existing contacts for this client
            await prisma.clientContact.deleteMany({
              where: { clientId: id }
            })
            
            // Create new contacts in normalized table
            if (contactsArray.length > 0) {
              await prisma.clientContact.createMany({
                data: contactsArray.map(contact => ({
                  id: contact.id || undefined, // Use provided ID or let Prisma generate
                  clientId: id,
                  name: contact.name || '',
                  email: contact.email || null,
                  phone: contact.phone || null,
                  mobile: contact.mobile || contact.phone || null,
                  role: contact.role || null,
                  title: contact.title || contact.department || null,
                  isPrimary: !!contact.isPrimary,
                  notes: contact.notes || ''
                }))
              })
            }
          } catch (contactSyncError) {
            console.warn('⚠️ Failed to sync contacts to normalized table (non-critical):', contactSyncError.message)
            // Don't fail the update if contact sync fails
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
          } catch (commentSyncError) {
            console.error('❌ Failed to sync comments to normalized table:', commentSyncError)
            console.error('Error details:', commentSyncError.message, commentSyncError.code)
            // Still continue - comments are saved in JSON for backward compatibility
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
        
        // Merge all update data
        Object.assign(updateData, jsonFieldsToUpdate)
        
        // Remove undefined values
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        try {
          // Phase 2: Dual-write update - writes to both String and JSONB
          const client = await prisma.client.update({ where: { id }, data: updateData })
          // Parse JSON fields before returning (will read from JSONB first)
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
      ? `Client handler failed: ${e.message}` 
      : 'Failed to process request'
    
    return serverError(res, errorMessage, e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))