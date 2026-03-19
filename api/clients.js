import { Prisma } from '@prisma/client'
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
    // Parse the URL path - use originalUrl or url (Express may give either)
    const rawPath = (req.originalUrl || req.url || '').split('?')[0].split('#')[0]
    const urlPath = rawPath.replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // For /api/clients/[id]
    const isListOrCreate = (pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && (urlPath === '/clients' || urlPath === '/clients/'))

    // List Clients (GET /api/clients) — never 500: top-level catch returns empty list so UI always gets valid JSON
    if (req.method === 'GET' && isListOrCreate) {
      try {
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
        
        // Check if externalAgentId column exists before including relation
        let hasExternalAgentId = false
        try {
          // PostgreSQL stores table_name in lowercase in information_schema
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
              SELECT 1 FROM information_schema.tables
              WHERE LOWER(table_name) = 'clientcompanygroup'
            ) as "exists"
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
          
          // Query clients directly using Prisma - include 'client', 'group', and legacy (null/empty) types
          // Use defensive includes - if relations fail, try without them
          try {
            rawClients = await prisma.client.findMany({
              where: {
                OR: [
                  { type: 'client' },
                  { type: 'group' },
                  { type: null },
                  { type: '' }
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
                },
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
                    notes: true,
                    createdAt: true
                  },
                  orderBy: [
                    { isPrimary: 'desc' },
                    { createdAt: 'asc' }
                  ]
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
                // Phase 6: Include normalized tables for sites, contracts, proposals, followUps, services
                clientSites: {
                  select: {
                    id: true,
                    name: true,
                    address: true,
                    contactPerson: true,
                    contactPhone: true,
                    contactEmail: true,
                    notes: true,
                    createdAt: true
                  },
                  orderBy: {
                    createdAt: 'asc'
                  }
                },
                clientContracts: {
                  select: {
                    id: true,
                    name: true,
                    size: true,
                    type: true,
                    uploadDate: true,
                    url: true,
                    createdAt: true
                  },
                  orderBy: {
                    uploadDate: 'desc'
                  }
                },
                clientProposals: {
                  select: {
                    id: true,
                    title: true,
                    amount: true,
                    status: true,
                    workingDocumentLink: true,
                    createdDate: true,
                    expiryDate: true,
                    notes: true,
                    createdAt: true
                  },
                  orderBy: {
                    createdDate: 'desc'
                  }
                },
                clientFollowUps: {
                  select: {
                    id: true,
                    date: true,
                    time: true,
                    type: true,
                    description: true,
                    completed: true,
                    assignedTo: true,
                    createdAt: true
                  },
                  orderBy: {
                    date: 'asc',
                    time: 'asc'
                  }
                },
                clientServices: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    price: true,
                    status: true,
                    startDate: true,
                    endDate: true,
                    notes: true,
                    createdAt: true
                  },
                  orderBy: {
                    startDate: 'desc'
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
          } catch (relationError) {
            // If relations fail, try query with minimal relations (still include groupMemberships)
            console.warn('⚠️ Query with relations failed:', {
              message: relationError.message,
              code: relationError.code,
              meta: relationError.meta
            })
            // Include client + group + null + ''; exclude lead
            console.warn('⚠️ Trying with minimal relations...')
            try {
              rawClients = await prisma.client.findMany({
                where: {
                  OR: [
                    { type: 'client' },
                    { type: 'group' },
                    { type: null },
                    { type: '' }
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
                    orderBy: [
                      { isPrimary: 'desc' },
                      { createdAt: 'asc' }
                    ]
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
                    orderBy: [{ createdAt: 'desc' }]
                  },
                  // Phase 6: Include normalized tables
                  clientSites: true,
                  clientContracts: true,
                  clientProposals: true,
                  clientFollowUps: true,
                  clientServices: true,
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
              
              // Include client + group + null + ''; exclude lead
              try {
                rawClients = await prisma.client.findMany({
                  where: {
                    OR: [
                      { type: 'client' },
                      { type: 'group' },
                      { type: null },
                      { type: '' }
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
            // Include client + group + null + ''; exclude lead
            rawClients = rawClients.filter(c => !c.type || c.type === 'client' || c.type === 'group' || c.type === null || c.type === '')
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
                  SELECT id, name, type, industry, "engagementStage", "aidaStatus", revenue, value, probability,
                         "lastContact", address, website, notes, contacts, "followUps",
                         "projectIds", comments, sites, contracts, "activityLog",
                         "billingTerms", "ownerId", "externalAgentId", "createdAt", "updatedAt",
                         proposals, thumbnail, services, "rssSubscribed", kyc, "kycJsonb"
                  FROM "Client"
                  WHERE (type = 'client' OR type = 'group' OR type IS NULL OR type = '')
                  AND (type IS NULL OR type != 'lead')
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
              // Include client + group + null + ''; exclude lead
              rawClients = rawClients
                .filter(c => !c.type || c.type === 'client' || c.type === 'group' || c.type === null || c.type === '')
            }
          }
        }
        
        // Hydrate externalAgent and groupMemberships so listing always has Company Group and External Agent
        try {
          const idsNeedingAgent = [...new Set(rawClients.filter(c => c.externalAgentId && !c.externalAgent).map(c => c.externalAgentId))];
          if (idsNeedingAgent.length > 0) {
            const agents = await prisma.externalAgent.findMany({
              where: { id: { in: idsNeedingAgent } },
              select: { id: true, name: true }
            });
            const agentByKey = Object.fromEntries(agents.map(a => [a.id, a]));
            rawClients = rawClients.map(c => {
              if (c.externalAgentId && !c.externalAgent && agentByKey[c.externalAgentId]) {
                return { ...c, externalAgent: agentByKey[c.externalAgentId] };
              }
              return c;
            });
          }
          const clientIdsNeedingGroups = rawClients.filter(c => !c.groupMemberships || !Array.isArray(c.groupMemberships) || c.groupMemberships.length === 0).map(c => c.id);
          if (clientIdsNeedingGroups.length > 0) {
            const rows = await prisma.$queryRaw`
              SELECT m.id, m."clientId", m."groupId", m.role,
                     g.id as "g_id", g.name as "g_name", g.type as "g_type", g.industry as "g_industry"
              FROM "ClientCompanyGroup" m
              INNER JOIN "Client" g ON g.id = m."groupId"
              WHERE m."clientId" IN (${Prisma.join(clientIdsNeedingGroups)})
            `;
            const byClientId = {};
            for (const r of (rows || [])) {
              const cid = r.clientId;
              if (!byClientId[cid]) byClientId[cid] = [];
              byClientId[cid].push({
                id: r.id,
                clientId: r.clientId,
                groupId: r.groupId,
                role: r.role,
                group: r.g_id ? { id: r.g_id, name: r.g_name || '', type: r.g_type || null, industry: r.g_industry || null } : null
              });
            }
            rawClients = rawClients.map(c => {
              const hydrated = byClientId[c.id];
              if (hydrated && hydrated.length > 0) return { ...c, groupMemberships: hydrated };
              return c;
            });
          }
        } catch (e) {
          console.warn('⚠️ Could not hydrate client list relations:', e.message);
        }

        // Always hydrate clientSites from ClientSite table so list shows sites (try Prisma, fallback to raw SQL)
        const allClientIds = rawClients.map(c => c.id).filter(Boolean);
        let sitesList = [];
        if (allClientIds.length > 0) {
          try {
            sitesList = await prisma.clientSite.findMany({
              where: { clientId: { in: allClientIds } },
              orderBy: { createdAt: 'asc' }
            });
          } catch (prismaErr) {
            try {
              const rawSites = await prisma.$queryRaw`
                SELECT id, "clientId", name, address, "contactPerson", "contactPhone", "contactEmail", notes, "siteLead", "engagementStage", "aidaStatus", "siteType", "createdAt", "updatedAt"
                FROM "ClientSite"
                WHERE "clientId" IN (${Prisma.join(allClientIds)})
                ORDER BY "createdAt" ASC
              `;
              sitesList = rawSites || [];
            } catch (rawErr) {
              console.warn('⚠️ Could not hydrate clientSites (Prisma or raw):', prismaErr.message, rawErr.message);
            }
          }
          const sitesByClientId = {};
          for (const site of sitesList || []) {
            const key = String(site.clientId || '');
            if (!sitesByClientId[key]) sitesByClientId[key] = [];
            sitesByClientId[key].push(site);
          }
          rawClients = rawClients.map(c => ({
            ...c,
            clientSites: sitesByClientId[String(c.id || '')] || []
          }));
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
        
        // Parse JSON fields before returning and add starred status (per-client try/catch so one bad record doesn't 500 the whole list)
        const parsedClients = clients.map(client => {
          let parsed
          try {
            parsed = parseClientJsonFields(client)
          } catch (parseErr) {
            console.warn('⚠️ parseClientJsonFields failed for client', client?.id, parseErr?.message)
            parsed = {
              id: client.id,
              name: client.name || '',
              type: client.type || 'client',
              contacts: [],
              comments: [],
              sites: [],
              groupMemberships: [],
              projectIds: [],
              externalAgentId: client.externalAgentId ?? null,
              externalAgent: client.externalAgent ? { id: client.externalAgent.id, name: client.externalAgent.name || '' } : null
            }
          }
          parsed.isStarred = validUserId && client.starredBy && Array.isArray(client.starredBy) && client.starredBy.length > 0
          const rawGroupMemberships = client.groupMemberships || parsed.groupMemberships
          parsed.groupMemberships = (rawGroupMemberships && Array.isArray(rawGroupMemberships)) ? rawGroupMemberships : []
          parsed.externalAgentId = parsed.externalAgentId ?? client.externalAgentId ?? client.externalAgent?.id ?? null
          parsed.externalAgent = parsed.externalAgent ?? (client.externalAgent ? { id: client.externalAgent.id, name: client.externalAgent.name || '' } : null)
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
        res.setHeader('X-Client-Count', String(parsedClients.length))

        try {
          return ok(res, { clients: parsedClients })
        } catch (sendErr) {
          // Serialization/send failed — return 200 with empty list so we never 500 for GET /api/clients
          console.error('❌ GET /api/clients: failed to serialize or send response:', sendErr?.message || sendErr)
          if (!res.headersSent) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            res.setHeader('X-Client-List-Degraded', '1')
            res.setHeader('X-Client-Count', '0')
            return ok(res, { clients: [], _degraded: true, _error: process.env.NODE_ENV === 'development' ? sendErr?.message : undefined })
          }
        }
        return
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
        console.error('   💡 Diagnose: GET /api/db-health (no auth) shows connection status and error details.')
        
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
        
        // Last-resort: try minimal query with no relations to avoid 500
        // Include client + group + null + ''; exclude lead
        try {
          const minimal = await prisma.client.findMany({
            where: {
              OR: [
                { type: 'client' },
                { type: 'group' },
                { type: null },
                { type: '' }
              ]
            },
            orderBy: { createdAt: 'desc' },
            take: 5000
          })
          // Hydrate sites from ClientSite so "Show sites" works even when main query failed (e.g. local vs production)
          let clientsWithSites = minimal || []
          try {
            const clientIds = clientsWithSites.map(c => c.id).filter(Boolean)
            if (clientIds.length > 0) {
              let sitesList = []
              try {
                sitesList = await prisma.clientSite.findMany({
                  where: { clientId: { in: clientIds } },
                  orderBy: { createdAt: 'asc' }
                })
              } catch (e) {
                const rawSites = await prisma.$queryRaw`
                  SELECT id, "clientId", name, address, "contactPerson", "contactPhone", "contactEmail", notes, "siteLead", "engagementStage", "aidaStatus", "siteType", "createdAt", "updatedAt"
                  FROM "ClientSite"
                  WHERE "clientId" IN (${Prisma.join(clientIds)})
                  ORDER BY "createdAt" ASC
                `
                sitesList = rawSites || []
              }
              const sitesByClientId = {}
              for (const site of sitesList || []) {
                const key = String(site.clientId || '')
                if (!sitesByClientId[key]) sitesByClientId[key] = []
                sitesByClientId[key].push(site)
              }
              clientsWithSites = clientsWithSites.map(c => ({
                ...c,
                clientSites: sitesByClientId[String(c.id || '')] || [],
                groupMemberships: [],
                starredBy: []
              }))
            } else {
              clientsWithSites = clientsWithSites.map(c => ({ ...c, groupMemberships: [], starredBy: [] }))
            }
          } catch (hydrateErr) {
            console.warn('⚠️ Could not hydrate clientSites in minimal fallback:', hydrateErr.message)
            clientsWithSites = (minimal || []).map(c => ({ ...c, groupMemberships: [], starredBy: [] }))
          }
          const parsed = clientsWithSites.map(c => {
            let p
            try {
              p = parseClientJsonFields(c)
            } catch (e) {
              console.warn('⚠️ parseClientJsonFields failed in minimal fallback for client', c?.id, e?.message)
              p = { id: c.id, name: c.name || '', type: c.type || 'client', contacts: [], comments: [], sites: [], groupMemberships: [], projectIds: [], externalAgentId: null, externalAgent: null }
            }
            p.groupMemberships = p.groupMemberships || []
            p.isStarred = false
            return p
          })
          console.warn('⚠️ GET /api/clients fell back to minimal query (no relations). Check schema/migrations.')
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
          res.setHeader('X-Client-Count', String(parsed.length))
          return ok(res, { clients: parsed })
        } catch (minimalErr) {
          console.error('❌ Minimal clients query also failed:', minimalErr.message, minimalErr.code)
        }
        
        // Never 500 on list: return empty list so UI can load; server logs have the real error
        console.error('❌ GET /api/clients returning empty list (degraded). Fix DB/schema and restart. Error:', dbError?.message)
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
        res.setHeader('X-Client-List-Degraded', '1')
        res.setHeader('X-Client-Count', '0')
        return ok(res, { clients: [], _degraded: true, _error: process.env.NODE_ENV === 'development' ? dbError.message : undefined })
      }
      } catch (anyErr) {
        console.error('❌ GET /api/clients unexpected error (returning empty list):', anyErr?.message, anyErr?.stack?.substring(0, 500))
        if (!res.headersSent && !res.writableEnded) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
          res.setHeader('X-Client-List-Degraded', '1')
          res.setHeader('X-Client-Count', '0')
          return ok(res, { clients: [], _degraded: true, _error: process.env.NODE_ENV === 'development' ? anyErr?.message : undefined })
        }
      }
    }

    // Create Client (POST /api/clients)
    if (req.method === 'POST' && isListOrCreate) {
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
      
      // CRITICAL FIX: Handle services separately (like in update endpoint)
      // Services can be simple string arrays (tags) or object arrays (full service records)
      let servicesForJson = []
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
        
        // Convert to array of strings for JSON storage (frontend expects simple string array)
        servicesForJson = servicesArray.map(s => {
          // If service is a string, use it directly
          if (typeof s === 'string') {
            return s
          }
          // If service is an object, use its name
          return s.name || s
        })
      }
      
      const parsedValue = Number.parseFloat(body.value)
      const parsedRevenue = Number.parseFloat(body.revenue)
      const clientData = {
        name: body.name,
        type: 'client', // Always 'client' for client creation - never allow override
        industry: body.industry || 'Other',
        revenue: parseFloat(body.revenue) || 0,
        value: Number.isFinite(parsedValue) ? parsedValue : (Number.isFinite(parsedRevenue) ? parsedRevenue : 0),
        probability: parseInt(body.probability) ?? 0,
        engagementStage: (body.engagementStage != null && String(body.engagementStage).trim() !== '') ? String(body.engagementStage) : 'Potential',
        aidaStatus: (body.aidaStatus != null && String(body.aidaStatus).trim() !== '') ? String(body.aidaStatus) : 'Awareness',
        lastContact: body.lastContact ? new Date(body.lastContact) : new Date(),
        address: body.address || '',
        website: body.website || '',
        notes: body.notes || '',
        thumbnail: body.thumbnail || '',
        externalAgentId: body.externalAgentId && String(body.externalAgentId).trim() ? body.externalAgentId : null,
        rssSubscribed: body.rssSubscribed !== false,
        // Phase 2: Dual-write - both String (backward compatibility) and JSONB (new)
        ...jsonFields,
        // CRITICAL FIX: Add services to JSON fields for persistence
        services: JSON.stringify(servicesForJson),
        servicesJsonb: servicesForJson,
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
            revenue: clientData.revenue,
            value: clientData.value,
            probability: clientData.probability,
            engagementStage: clientData.engagementStage,
            aidaStatus: clientData.aidaStatus,
            lastContact: clientData.lastContact,
            address: clientData.address,
            website: clientData.website,
            notes: clientData.notes,
            thumbnail: clientData.thumbnail || '',
            externalAgentId: clientData.externalAgentId,
            rssSubscribed: clientData.rssSubscribed,
            // Phase 5: Contacts/comments are written to normalized tables ONLY - no JSON writes
            // Removed: contacts, contactsJsonb, comments, commentsJsonb
            // Phase 6: Sites, contracts, proposals, followUps are written to normalized tables ONLY
            // Removed: sites, sitesJsonb, contracts, contractsJsonb, proposals, proposalsJsonb, followUps, followUpsJsonb
            // CRITICAL FIX: Services are saved to JSON fields (both String and JSONB) for persistence
            // Services are simple string arrays (tags), not full service records
            services: clientData.services || '[]',
            servicesJsonb: clientData.servicesJsonb || [],
            // Phase 4: projectIds deprecated - projects managed via Project.clientId relation
            // Still include for backward compatibility if provided, but prefer Project.clientId
            projectIds: clientData.projectIds || '[]',
            activityLog: clientData.activityLog || '[]',
            activityLogJsonb: clientData.activityLogJsonb || [],
            billingTerms: clientData.billingTerms || JSON.stringify(DEFAULT_BILLING_TERMS),
            billingTermsJsonb: clientData.billingTermsJsonb || DEFAULT_BILLING_TERMS,
            kyc: clientData.kyc !== undefined ? clientData.kyc : '{}',
            kycJsonb: clientData.kycJsonb !== undefined ? clientData.kycJsonb : {},
            ...(ownerId ? { ownerId } : {})
          }
        })
        
        
        // Phase 5: Sync contacts and comments to normalized tables after client creation
        // Accept both *Jsonb and plain names (e.g. lead conversion sends contacts/sites/comments)
        const contactsToSync = Array.isArray(clientData.contactsJsonb) && clientData.contactsJsonb.length > 0
          ? clientData.contactsJsonb
          : (Array.isArray(clientData.contacts) ? clientData.contacts : [])
        const commentsToSync = Array.isArray(clientData.commentsJsonb) && clientData.commentsJsonb.length > 0
          ? clientData.commentsJsonb
          : (Array.isArray(clientData.comments) ? clientData.comments : [])
        const sitesToSync = Array.isArray(clientData.sitesJsonb) && clientData.sitesJsonb.length > 0
          ? clientData.sitesJsonb
          : (Array.isArray(clientData.sites) ? clientData.sites : [])
        const contractsToSync = Array.isArray(clientData.contractsJsonb) && clientData.contractsJsonb.length > 0
          ? clientData.contractsJsonb
          : (Array.isArray(clientData.contracts) ? clientData.contracts : [])
        const proposalsToSync = Array.isArray(clientData.proposalsJsonb) && clientData.proposalsJsonb.length > 0
          ? clientData.proposalsJsonb
          : (Array.isArray(clientData.proposals) ? clientData.proposals : [])
        const followUpsToSync = Array.isArray(clientData.followUpsJsonb) && clientData.followUpsJsonb.length > 0
          ? clientData.followUpsJsonb
          : (Array.isArray(clientData.followUps) ? clientData.followUps : [])

        try {
          // Sync sites first so contact.siteId can reference them (e.g. lead conversion)
          if (sitesToSync.length > 0) {
            for (const site of sitesToSync) {
              const siteData = {
                clientId: client.id,
                name: site.name || '',
                address: site.address || '',
                contactPerson: site.contactPerson || '',
                contactPhone: site.contactPhone || '',
                contactEmail: site.contactEmail || '',
                notes: site.notes || '',
                siteLead: site.siteLead != null ? String(site.siteLead) : '',
                engagementStage: (site.engagementStage != null && String(site.engagementStage).trim() !== '') ? String(site.engagementStage) : 'Potential',
                aidaStatus: (site.aidaStatus != null && String(site.aidaStatus).trim() !== '') ? String(site.aidaStatus) : 'Awareness',
                siteType: site.siteType === 'client' ? 'client' : 'lead'
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

          // Sync contacts if provided - use upsert to handle duplicates (siteId valid after sites created)
          if (contactsToSync.length > 0) {
            for (const contact of contactsToSync) {
              const contactData = {
                clientId: client.id,
                name: contact.name || '',
                email: contact.email || null,
                phone: contact.phone || null,
                mobile: contact.mobile || contact.phone || null,
                role: contact.role || null,
                title: contact.title || contact.department || null,
                isPrimary: !!contact.isPrimary,
                notes: contact.notes || '',
                siteId: (contact.siteId && String(contact.siteId).trim() !== '') ? contact.siteId : null
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
          if (commentsToSync.length > 0) {
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
            
            for (const comment of commentsToSync) {
              // Map frontend field names (createdBy/createdById/createdByEmail) to database fields (author/authorId/userName)
              // Support both naming conventions for backward compatibility
              const commentData = {
                clientId: client.id,
                text: comment.text || '',
                authorId: comment.authorId || comment.createdById || userId || null,
                author: comment.author || comment.createdBy || authorName || '',
                userName: comment.userName || comment.createdByEmail || userName || null,
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
          
          // Sync contracts if provided
          if (contractsToSync.length > 0) {
            for (const contract of contractsToSync) {
              const contractData = {
                clientId: client.id,
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
          if (proposalsToSync.length > 0) {
            for (const proposal of proposalsToSync) {
              const proposalData = {
                clientId: client.id,
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
          if (followUpsToSync.length > 0) {
            for (const followUp of followUpsToSync) {
              const followUpData = {
                clientId: client.id,
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
          
          // Sync services to normalized table ONLY if they are objects with full details
          // Skip normalized table sync if services are simple strings (tags) - they're stored in JSON fields
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
            
            // Only sync to normalized table if services are objects with full details
            const hasServiceObjects = servicesArray.some(s => typeof s === 'object' && s !== null && (s.description !== undefined || s.price !== undefined))
            
            if (hasServiceObjects) {
              for (const service of servicesArray) {
                // Skip string services in normalized table - they're just tags
                if (typeof service === 'string') {
                  continue
                }
                
                const serviceData = {
                  clientId: client.id,
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
            // If services are simple strings, they're already saved to JSON fields above - no normalized table sync needed
          }
        } catch (syncError) {
          console.warn('⚠️ Failed to sync normalized data to tables (non-critical):', syncError.message)
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
                type: 'client',
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
        console.error('❌ Database error creating client:', dbError?.message || dbError)
        if (dbError?.code) console.error('   Prisma code:', dbError.code, dbError.meta ? 'meta:' : '', dbError.meta)
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
        // PATCH uses hasExternalAgentId and hasGroupMembershipsTable in the update include below;
        // they are only set in the GET list branch, so define here (schema has these relations).
        let hasExternalAgentId = true
        let hasGroupMembershipsTable = true
        try {
          const colCheck = await prisma.$queryRaw`
            SELECT column_name FROM information_schema.columns
            WHERE LOWER(table_name) = 'client' AND column_name = 'externalAgentId'
          `
          hasExternalAgentId = Array.isArray(colCheck) && colCheck.length > 0
        } catch (_) {}
        try {
          const tblCheck = await prisma.$queryRaw`
            SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE LOWER(table_name) = 'clientcompanygroup') as "exists"
          `
          hasGroupMembershipsTable = tblCheck?.[0]?.exists === true
        } catch (_) {}

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
        
        // Phase 6: Sync proposals to normalized ClientProposal table (same as leads API)
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
        
        // Handle externalAgentId separately
        if (body.externalAgentId !== undefined) {
          updateData.externalAgentId = body.externalAgentId || null
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
              projects: { select: { id: true, name: true, status: true } },
              ...(hasExternalAgentId ? { externalAgent: true } : {}),
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
              } : {})
            }
          })
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