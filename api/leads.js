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
    console.log('🔍 Leads API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Parse the URL path - strip /api/ prefix if present
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Leads (GET /api/leads)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'leads') {
      try {
        console.log('📋 GET /api/leads - Starting query...')
        
        // Ensure database connection
        try {
          await prisma.$connect()
          console.log('✅ Database connected')
        } catch (connError) {
          console.warn('⚠️ Connection check failed (may reconnect automatically):', connError.message)
        }
        
        // Ensure type column exists in database
        try {
          await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`
          console.log('✅ Type column ensured in database')
        } catch (schemaError) {
          // Column might already exist - this is expected if schema is up to date
          console.log('ℹ️ Type column check skipped (expected if schema is up to date):', schemaError.message)
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
            console.log('✅ Services column added to database')
          } else {
            console.log('✅ Services column already exists')
          }
        } catch (schemaError) {
          // If error contains "already exists" or "duplicate", column already exists
          if (schemaError.message && (schemaError.message.includes('already exists') || schemaError.message.includes('duplicate'))) {
            console.log('ℹ️ Services column already exists:', schemaError.message)
          } else {
            console.log('ℹ️ Services column check failed (may already exist):', schemaError.message)
          }
        }
        
        const userId = req.user?.sub
        const userEmail = req.user?.email || 'unknown'
        
        // Include tags for list view - needed for Tags column
        let leads = []
        try {
          console.log(`🔍 Querying leads for user: ${userEmail} (${userId})`)
          console.log('🔍 Querying leads with type filter (including tags)...')
          // IMPORTANT: Return ALL leads regardless of ownerId - all users should see all leads
          // EXPLICITLY exclude ownerId from WHERE clause to ensure all leads are returned
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
              }
              // starredBy relation removed - StarredClient table doesn't exist in restored database
            },
            orderBy: { createdAt: 'desc' } 
          })
          console.log(`✅ Leads retrieved successfully for ${userEmail}:`, leads.length, 'total leads (no ownerId filtering)')
          
          // DEBUG: Also check raw SQL to verify what's actually in database
          try {
            const rawLeads = await prisma.$queryRaw`
              SELECT id, name, type, "ownerId", "createdAt"
              FROM "Client"
              WHERE type = 'lead'
              ORDER BY "createdAt" DESC
            `
            console.log(`🔍 RAW SQL QUERY: Found ${rawLeads.length} leads in database`)
            if (rawLeads.length > 0) {
              console.log(`📋 Raw SQL leads:`, JSON.stringify(rawLeads.map(l => ({ 
                id: l.id, 
                name: l.name, 
                type: l.type, 
                ownerId: l.ownerId || 'null' 
              })), null, 2))
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
            console.log(`📋 Lead details visible to ${userEmail}:`, JSON.stringify(leadDetails, null, 2))
          } else {
            console.log(`⚠️ No leads found for ${userEmail} - checking if any leads exist in database...`)
            
            // Additional check: query ALL records to see what types exist
            try {
              const allTypes = await prisma.$queryRaw`
                SELECT type, COUNT(*) as count
                FROM "Client"
                GROUP BY type
              `
              console.log(`📊 Database type distribution:`, JSON.stringify(allTypes, null, 2))
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
            const allRecords = await prisma.client.findMany({
              include: {
                tags: {
                  include: {
                    tag: true
                  }
                }
                // starredBy relation removed - StarredClient table doesn't exist in restored database
              },
              orderBy: { createdAt: 'desc' }
              // No ownerId filter - all users see all leads
            })
            console.log(`📊 Found ${allRecords.length} total client records`)
            // Filter to only leads
            leads = allRecords.filter(record => {
              // If type exists, it must be 'lead'
              if (record.type !== null && record.type !== undefined && record.type !== '') {
                return record.type === 'lead'
              }
              // If type is null/undefined/empty, skip (legacy data without type should not be treated as leads)
              return false
            })
            console.log(`✅ Filtered to ${leads.length} leads for ${userEmail}`)
            // Log lead details for debugging visibility issues
            if (leads.length > 0) {
              const leadDetails = leads.map(l => ({ id: l.id, name: l.name, ownerId: l.ownerId || 'null' }))
              console.log(`📋 Lead details visible to ${userEmail}:`, JSON.stringify(leadDetails, null, 2))
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
          parsed.isStarred = false; // StarredClient table doesn't exist in restored database
          return parsed;
        });
        
        // Final verification: Log response before sending to ensure all leads are included
        console.log(`📤 Sending ${parsedLeads.length} leads to ${userEmail} (no filtering applied)`)
        if (parsedLeads.length > 0) {
          console.log(`📋 Response includes leads:`, parsedLeads.map(l => ({ id: l.id, name: l.name, ownerId: l.ownerId || 'null' })))
          // Log stage field for ReitCoal specifically
          const reitcoulLead = parsedLeads.find(l => l.name && l.name.toLowerCase().includes('reit'));
          if (reitcoulLead) {
            console.log(`🎯 ReitCoal lead stage in API response:`, { name: reitcoulLead.name, stage: reitcoulLead.stage, hasStage: reitcoulLead.stage !== undefined && reitcoulLead.stage !== null })
          }
        }
        
        // CRITICAL: Double-check that we're not filtering by ownerId
        // Log database connection info to verify we're querying the same database
        try {
          const dbInfo = await prisma.$queryRaw`SELECT current_database() as db_name, current_user as db_user`
          console.log(`🔍 Database connection for ${userEmail}:`, dbInfo)
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
      console.log('🔍 Raw request body:', req.body)
      console.log('🔍 Request headers:', req.headers)
      console.log('🔍 Content-Type:', req.headers['content-type'])
      
      const body = req.body || {}
      console.log('🔍 Received lead creation data:', body)
      console.log('🔍 Body type:', typeof body)
      console.log('🔍 Body keys:', Object.keys(body))
      console.log('🔍 Body.name:', body.name)
      
      if (!body.name) {
        console.log('❌ Missing name field in request body')
        return badRequest(res, 'name required')
      }

      // Check for duplicate clients/leads before creating
      try {
        const duplicateCheck = await checkForDuplicates(body)
        if (duplicateCheck && duplicateCheck.isDuplicate) {
          const errorMessage = formatDuplicateError(duplicateCheck) || duplicateCheck.message
          console.log('❌ Duplicate lead detected:', errorMessage)
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
        console.log('✅ Type column ensured in database')
      } catch (error) {
        console.log('Type column already exists or error adding it:', error.message)
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
            console.log('⚠️ Invalid date format for lastContact, using current date')
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
        proposals: JSON.stringify(Array.isArray(body.proposals) ? body.proposals : [])
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

      console.log(`🔍 Creating lead for user: ${userEmail} (${userId})`)
      console.log('🔍 Creating lead with data:', leadData)
      console.log('🔍 Lead data keys:', Object.keys(leadData))
      
      try {
        const lead = await prisma.client.create({
          data: leadData
        })
        
        console.log(`✅ Lead "${lead.name}" created successfully by ${userEmail}:`, lead.id, 'ownerId:', lead.ownerId || 'null', 'type:', lead.type || 'MISSING')
        
        // VERIFY: Immediately re-query the database to confirm the lead exists and is queryable
        try {
          const verifyLead = await prisma.client.findUnique({ 
            where: { id: lead.id },
            select: { id: true, name: true, type: true, ownerId: true }
          })
          if (!verifyLead) {
            console.error(`❌ CRITICAL: Lead ${lead.id} was created but cannot be found on re-query!`)
          } else {
            console.log(`✅ Verification: Lead ${lead.id} exists in database with type="${verifyLead.type}", ownerId="${verifyLead.ownerId || 'null'}"`)
            
            // Also verify it's queryable by type filter
            const typeQueryResult = await prisma.client.findMany({
              where: { type: 'lead', id: lead.id },
              select: { id: true, name: true }
            })
            if (typeQueryResult.length === 0) {
              console.error(`❌ CRITICAL: Lead ${lead.id} exists but is NOT queryable by type='lead' filter!`)
              console.error(`   Lead type in database: "${verifyLead.type}"`)
            } else {
              console.log(`✅ Verification: Lead ${lead.id} IS queryable by type='lead' filter`)
            }
          }
        } catch (verifyError) {
          console.error(`❌ Error verifying lead creation:`, verifyError.message)
        }
        
        // Parse JSON fields for response (same as GET endpoint)
        const parsedLead = parseClientJsonFields(lead)
        parsedLead.isStarred = false // StarredClient table doesn't exist
        
        console.log(`📤 Returning created lead to ${userEmail}:`, { id: parsedLead.id, name: parsedLead.name, ownerId: parsedLead.ownerId || 'null', type: parsedLead.type })
        
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
          console.log('✅ Lead retrieved successfully:', lead.id)
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
            console.log('❌ Duplicate lead detected on update:', errorMessage)
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
          proposals: body.proposals !== undefined ? (typeof body.proposals === 'string' ? body.proposals : JSON.stringify(body.proposals)) : undefined
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating lead with data:', updateData)
        console.log('🔍 Update data contains status:', updateData.status)
        console.log('🔍 Update data contains stage:', updateData.stage)
        console.log('🔍 Update data contains proposals:', updateData.proposals ? (typeof updateData.proposals === 'string' ? JSON.parse(updateData.proposals).length + ' proposals' : updateData.proposals.length + ' proposals') : 'NO PROPOSALS')
        console.log('🔍 Raw body.proposals:', body.proposals ? (Array.isArray(body.proposals) ? body.proposals.length + ' proposals' : typeof body.proposals) : 'undefined')
        console.log('🔍 Lead ID to update:', id)
        
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
          console.log('🔍 Found existing lead:', existing.id, 'current status:', existing.status)
          
          // Now update it
          const lead = await prisma.client.update({ 
          where: { id }, 
          data: updateData 
          })
          console.log('✅ Lead updated successfully:', lead.id)
          console.log('✅ Updated lead status:', lead.status, '(was:', existing.status, ')')
          console.log('✅ Updated lead stage:', lead.stage)
          console.log('✅ Updated lead proposals:', lead.proposals ? (typeof lead.proposals === 'string' ? JSON.parse(lead.proposals).length + ' proposals' : lead.proposals.length + ' proposals') : 'NO PROPOSALS')
          console.log('✅ Full updated lead:', JSON.stringify(lead, null, 2))
          
        // CRITICAL DEBUG: Immediately re-query database to verify persistence
        const verifyLead = await prisma.client.findUnique({ where: { id } })
        console.log('🔍 VERIFY: Re-queried lead from DB:', verifyLead.id, 'status:', verifyLead.status, 'stage:', verifyLead.stage)
        console.log('🔍 VERIFY: Re-queried proposals:', verifyLead.proposals ? (typeof verifyLead.proposals === 'string' ? JSON.parse(verifyLead.proposals).length + ' proposals' : verifyLead.proposals.length + ' proposals') : 'NO PROPOSALS')
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
          console.log('✅ Lead deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting lead:', dbError)
          return serverError(res, 'Failed to delete lead', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or lead action')
  } catch (e) {
    return serverError(res, 'Lead handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
