// Leads API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'
import { checkForDuplicates, formatDuplicateError } from './_lib/duplicateValidation.js'

// Helper function to parse JSON fields from database responses
function parseClientJsonFields(client) {
  try {
    const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms', 'proposals', 'services']
    const parsed = { ...client }
    
    // Extract tags from ClientTag relations if present
    if (client.tags && Array.isArray(client.tags)) {
      parsed.tags = client.tags.map(ct => ct.tag).filter(Boolean)
    } else {
      parsed.tags = []
    }
    
    // Parse JSON fields
    for (const field of jsonFields) {
      const value = parsed[field]
      
      if (typeof value === 'string' && value) {
        try {
          parsed[field] = JSON.parse(value)
        } catch (e) {
          // Set safe defaults on parse error
          if (field === 'services') {
            parsed[field] = []
          } else if (field === 'billingTerms') {
            parsed[field] = {
              paymentTerms: 'Net 30',
              billingFrequency: 'Monthly',
              currency: 'ZAR',
              retainerAmount: 0,
              taxExempt: false,
              notes: ''
            }
          } else {
            parsed[field] = []
          }
        }
      } else if (value === null || value === undefined) {
        // Set safe defaults for null/undefined
        if (field === 'services') {
          parsed[field] = []
        } else if (field === 'billingTerms') {
          parsed[field] = {
            paymentTerms: 'Net 30',
            billingFrequency: 'Monthly',
            currency: 'ZAR',
            retainerAmount: 0,
            taxExempt: false,
            notes: ''
          }
        } else {
          parsed[field] = []
        }
      }
    }
    
    return parsed
  } catch (error) {
    console.error('Error parsing client JSON fields:', error)
    return client // Return original on error
  }
}

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
        
        // Include tags for list view - needed for Tags column
        let leads = []
        try {
          // IMPORTANT: Return ALL leads regardless of ownerId - all users should see all leads
          // EXPLICITLY exclude ownerId from WHERE clause to ensure all leads are returned
          // Use defensive includes - if relations fail, try without them
          try {
            leads = await prisma.client.findMany({ 
              where: { 
                type: 'lead'
                // Explicitly NO ownerId filter - all users see all leads
              },
              include: {
                tags: {
                  include: {
                    tag: true
                  }
                },
                externalAgent: true,
                // Include starredBy relation only if we have a valid userId
                // If no validUserId, starredBy will be undefined and isStarred will be false
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
          } catch (relationError) {
            // If relations fail, try query without relations
            console.warn('⚠️ Query with relations failed, trying without relations:', relationError.message)
            leads = await prisma.client.findMany({ 
              where: { 
                type: 'lead'
              },
              orderBy: { createdAt: 'desc' } 
            })
            // Add empty tags array to each lead
            leads = leads.map(l => ({ ...l, tags: [], externalAgent: null }))
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
                  tags: {
                    include: {
                      tag: true
                    }
                  },
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
              // Log lead details for debugging visibility issues
              if (leads.length > 0) {
                const leadDetails = leads.map(l => ({ id: l.id, name: l.name, ownerId: l.ownerId || 'null' }))
              }
            } catch (fallbackRelationError) {
              // Last resort: query without any relations
              console.warn('⚠️ Fallback query with relations failed, trying minimal query:', fallbackRelationError.message)
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
                .map(l => ({ ...l, tags: [] }))
            }
          } catch (fallbackError) {
            console.error('❌ Fallback query also failed:', {
              message: fallbackError.message,
              code: fallbackError.code,
              meta: fallbackError.meta,
              stack: fallbackError.stack
            })
            throw fallbackError
          }
        }
        
        // Parse JSON fields (services, contacts, etc.) and extract tags
        const parsedLeads = leads.map(lead => {
          const parsed = parseClientJsonFields(lead);
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
        const isConnError = logDatabaseError(dbError, 'listing leads')
        if (isConnError) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to list leads', dbError.message || 'Unknown database error')
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
        contacts: JSON.stringify(Array.isArray(body.contacts) ? body.contacts : []),
        followUps: JSON.stringify(Array.isArray(body.followUps) ? body.followUps : []),
        projectIds: JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : []),
        comments: JSON.stringify(Array.isArray(body.comments) ? body.comments : []),
        sites: JSON.stringify(Array.isArray(body.sites) ? body.sites : []),
        contracts: JSON.stringify(Array.isArray(body.contracts) ? body.contracts : []),
        activityLog: JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : []),
        billingTerms: JSON.stringify(typeof body.billingTerms === 'object' && body.billingTerms !== null ? body.billingTerms : {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        }),
        proposals: JSON.stringify(Array.isArray(body.proposals) ? body.proposals : []),
        externalAgentId: body.externalAgentId || null
      }


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
          const lead = await prisma.client.findFirst({ 
            where: { id, type: 'lead' } 
          })
          if (!lead) return notFound(res)
          return ok(res, { lead })
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
          notes: notes || undefined,
          contacts: body.contacts !== undefined ? (typeof body.contacts === 'string' ? body.contacts : JSON.stringify(body.contacts)) : undefined,
          followUps: body.followUps !== undefined ? (typeof body.followUps === 'string' ? body.followUps : JSON.stringify(body.followUps)) : undefined,
          projectIds: body.projectIds !== undefined ? (typeof body.projectIds === 'string' ? body.projectIds : JSON.stringify(body.projectIds)) : undefined,
          comments: body.comments !== undefined ? (typeof body.comments === 'string' ? body.comments : JSON.stringify(body.comments)) : undefined,
          sites: body.sites !== undefined ? (typeof body.sites === 'string' ? body.sites : JSON.stringify(body.sites)) : undefined,
          contracts: body.contracts !== undefined ? (typeof body.contracts === 'string' ? body.contracts : JSON.stringify(body.contracts)) : undefined,
          activityLog: body.activityLog !== undefined ? (typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(body.activityLog)) : undefined,
          billingTerms: body.billingTerms !== undefined ? (typeof body.billingTerms === 'string' ? body.billingTerms : JSON.stringify(body.billingTerms)) : undefined,
          proposals: body.proposals !== undefined ? (typeof body.proposals === 'string' ? body.proposals : JSON.stringify(body.proposals)) : undefined,
          externalAgentId: body.externalAgentId !== undefined ? (body.externalAgentId || null) : undefined
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        
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
    
    return serverError(res, 'Lead handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
