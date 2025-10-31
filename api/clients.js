import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

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
    
    // Extract tags from ClientTag relations if present (only in detail views)
    if (client.tags && Array.isArray(client.tags)) {
      parsed.tags = client.tags.map(ct => ct.tag).filter(Boolean)
    } else {
      parsed.tags = []
    }
    
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
    const urlPath = req.url.replace(/^\/api\//, '/')
    const pathSegments = urlPath.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // For /api/clients/[id]

    // List Clients (GET /api/clients)
    if (req.method === 'GET' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      try {
        console.log('📋 GET /api/clients - Starting optimized query...')
        
        // PERFORMANCE OPTIMIZATION: Query only clients directly with WHERE clause
        // This is MUCH faster than fetching all records and filtering in memory
        // Use database WHERE clause to filter - this uses indexes and is much faster
        // Query for type='client' OR type IS NULL (legacy data)
        // NOTE: Tags are excluded from list query for performance - they're only needed in detail views
        const clients = await prisma.client.findMany({
          where: {
            OR: [
              { type: 'client' },
              { type: null }
            ]
          },
          // Tags excluded for performance - only fetch when viewing individual client detail
          orderBy: { createdAt: 'desc' }
        })
        
        console.log(`✅ Found ${clients.length} clients (filtered in database)`)
        
        // Parse JSON fields before returning
        const parsedClients = clients.map(parseClientJsonFields)
        console.log(`✅ Returning ${parsedClients.length} parsed clients`)
        
        return ok(res, { clients: parsedClients })
      } catch (dbError) {
        console.error('❌ Database error listing clients:', {
          message: dbError.message,
          name: dbError.name,
          code: dbError.code,
          meta: dbError.meta,
          stack: dbError.stack
        })
        // Return detailed error for debugging (in production, you might want to hide details)
        return serverError(res, 'Failed to list clients', {
          error: dbError.message,
          code: dbError.code,
          name: dbError.name
        })
      }
    }

    // Create Client (POST /api/clients)
    if (req.method === 'POST' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'name required')

      // Ensure type and services columns exist in database
      try {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "services" TEXT DEFAULT '[]'`
        } catch (error) {
        // Column may already exist
      }

      // Verify user exists before setting ownerId
      let ownerId = null;
      if (req.user?.sub) {
        try {
          const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
          if (user) {
            ownerId = req.user.sub;
          }
        } catch (userError) {
          // Skip ownerId if error
        }
      }

      const clientData = {
        name: body.name,
        type: body.type || 'client', // Handle type field for leads vs clients
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

      try {
        const client = await prisma.client.create({
          data: {
            name: clientData.name,
            type: clientData.type,
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
        
        // Parse JSON fields before returning
        const parsedClient = parseClientJsonFields(client)
        return created(res, { client: parsedClient })
      } catch (dbError) {
        console.error('❌ Database error creating client:', dbError)
        return serverError(res, 'Failed to create client', dbError.message)
      }
    }

    // Get, Update, Delete Single Client (GET, PATCH, DELETE /api/clients/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'clients' && id) {
      if (req.method === 'GET') {
        try {
          // Include tags for detail view (single client queries are fast)
          const client = await prisma.client.findUnique({ 
            where: { id },
            include: {
              tags: {
                include: {
                  tag: true
                }
              }
            }
          })
          if (!client) return notFound(res)
          // Parse JSON fields before returning
          const parsedClient = parseClientJsonFields(client)
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
          services: typeof body.services === 'string' ? body.services : JSON.stringify(Array.isArray(body.services) ? body.services : []),
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
    return serverError(res, 'Client handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))