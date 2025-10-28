import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Helper function to parse JSON fields from database responses
function parseClientJsonFields(client) {
  const jsonFields = ['contacts', 'followUps', 'projectIds', 'comments', 'sites', 'contracts', 'activityLog', 'billingTerms']
  const parsed = { ...client }
  
  jsonFields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field])
      } catch (e) {
        // If parsing fails, set to default based on field type
        if (field === 'billingTerms') {
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
    } else if (!parsed[field]) {
      // Set defaults for missing fields
      if (field === 'billingTerms') {
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
  })
  
  return parsed
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
        // Return ONLY clients (not leads) - filter by type='client' explicitly
        // Also exclude null/undefined types to ensure data integrity
        // Optimized: removed opportunities include and expensive logging
        const allClients = await prisma.client.findMany({ 
          where: {
            type: 'client'
          },
          orderBy: { createdAt: 'desc' }
        })
        
        // Additional safeguard: filter out any leads or records with missing/invalid type
        const clients = allClients.filter(client => {
          // Explicitly check that type is exactly 'client' (not null, undefined, or 'lead')
          return client.type === 'client';
        })
        
        // Log warning if any records with null type exist in the database
        const recordsWithNullType = await prisma.client.findMany({
          where: {
            OR: [
              { type: null },
              { type: { not: { in: ['client', 'lead'] } } }
            ]
          },
          select: { id: true, name: true, type: true }
        })
        if (recordsWithNullType.length > 0) {
          console.warn(`⚠️ Found ${recordsWithNullType.length} Client records with invalid type:`, recordsWithNullType)
        }
        
        console.log('📊 Clients fetched from DB (before filter):', allClients.length)
        console.log('📊 Clients after filtering:', clients.length)
        console.log('📊 Client keys:', clients.length > 0 ? Object.keys(clients[0]) : 'No clients')
        
        // Parse JSON fields before returning
        const parsedClients = clients.map(parseClientJsonFields)
        
        if (parsedClients.length > 0) {
          console.log('📊 First client sample (parsed):', JSON.stringify(parsedClients[0], null, 2))
        }
        
        const responseData = { clients: parsedClients }
        console.log('📊 Preparing response with clients:', responseData)
        return ok(res, responseData)
      } catch (dbError) {
        console.error('❌ Database error listing clients:', dbError)
        return serverError(res, 'Failed to list clients', dbError.message)
      }
    }

    // Create Client (POST /api/clients)
    if (req.method === 'POST' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'name required')

      // Ensure type column exists in database
      try {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT`
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
          const client = await prisma.client.findUnique({ 
            where: { id }
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