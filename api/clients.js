import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Clients API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    // Parse the URL path (already has /api/ stripped by server)
    const pathSegments = req.url.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // For /api/clients/[id]

    // List Clients (GET /api/clients)
    if (req.method === 'GET' && ((pathSegments.length === 1 && pathSegments[0] === 'clients') || (pathSegments.length === 0 && req.url === '/clients/'))) {
      try {
        // Return ALL clients for all users - this is an ERP system where all users should see all clients
        const clients = await prisma.client.findMany({ 
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Clients retrieved successfully:', clients.length, 'for user:', req.user?.sub, '(all clients visible)')
        return ok(res, { clients })
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
        console.log('✅ Type column ensured in database')
      } catch (error) {
        console.log('Type column already exists or error adding it:', error.message)
      }

      // Verify user exists before setting ownerId
      let ownerId = null;
      if (req.user?.sub) {
        try {
          const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
          if (user) {
            ownerId = req.user.sub;
            console.log('✅ User verified for ownerId:', user.email);
          } else {
            console.log('⚠️ User not found in database, skipping ownerId');
          }
        } catch (userError) {
          console.log('⚠️ Error verifying user, skipping ownerId:', userError.message);
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

      console.log('🔍 Creating client with data:', clientData)
      console.log('🔍 Request body type field:', body.type)
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
            contacts: clientData.contacts,
            followUps: clientData.followUps,
            projectIds: clientData.projectIds,
            comments: clientData.comments,
            sites: clientData.sites,
            contracts: clientData.contracts,
            activityLog: clientData.activityLog,
            billingTerms: clientData.billingTerms,
            ...(ownerId ? { ownerId } : {})
          }
        })
        
        console.log('✅ Client created successfully with Prisma ORM:', client.id, 'Type:', client.type)
        return created(res, { client })
      } catch (dbError) {
        console.error('❌ Database error creating client:', dbError)
        return serverError(res, 'Failed to create client', dbError.message)
      }
    }

    // Get, Update, Delete Single Client (GET, PATCH, DELETE /api/clients/[id])
    if (pathSegments.length === 2 && pathSegments[0] === 'clients' && id) {
      if (req.method === 'GET') {
        try {
          const client = await prisma.client.findUnique({ where: { id } })
          if (!client) return notFound(res)
          console.log('✅ Client retrieved successfully:', client.id)
          return ok(res, { client })
        } catch (dbError) {
          console.error('❌ Database error getting client:', dbError)
          return serverError(res, 'Failed to get client', dbError.message)
        }
      }
      if (req.method === 'PATCH') {
        const body = req.body || {}
        const updateData = {
          name: body.name,
          type: body.type, // Handle type field for leads vs clients
          industry: body.industry,
          status: body.status,
          revenue: body.revenue,
          value: body.value, // Add value field
          probability: body.probability, // Add probability field
          lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
          address: body.address,
          website: body.website,
          notes: body.notes,
          contacts: JSON.stringify(Array.isArray(body.contacts) ? body.contacts : []),
          followUps: JSON.stringify(Array.isArray(body.followUps) ? body.followUps : []),
          projectIds: JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : []),
          comments: JSON.stringify(Array.isArray(body.comments) ? body.comments : []),
          sites: JSON.stringify(Array.isArray(body.sites) ? body.sites : []),
          contracts: JSON.stringify(Array.isArray(body.contracts) ? body.contracts : []),
          activityLog: JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : []),
          billingTerms: JSON.stringify(typeof body.billingTerms === 'object' ? body.billingTerms : {})
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating client with data:', updateData)
        try {
          const client = await prisma.client.update({ where: { id }, data: updateData })
          console.log('✅ Client updated successfully:', client.id)
          return ok(res, { client })
        } catch (dbError) {
          console.error('❌ Database error updating client:', dbError)
          return serverError(res, 'Failed to update client', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          // First, delete all related records to avoid foreign key constraints
          console.log('🔍 Checking for related records before deleting client:', id)
          
          // Delete opportunities
          const opportunitiesDeleted = await prisma.opportunity.deleteMany({
            where: { clientId: id }
          })
          console.log('🗑️ Deleted opportunities:', opportunitiesDeleted.count)
          
          // Delete invoices
          const invoicesDeleted = await prisma.invoice.deleteMany({
            where: { clientId: id }
          })
          console.log('🗑️ Deleted invoices:', invoicesDeleted.count)
          
          // Update projects to remove client reference (set clientId to null)
          const projectsUpdated = await prisma.project.updateMany({
            where: { clientId: id },
            data: { clientId: null }
          })
          console.log('🔄 Updated projects (removed client reference):', projectsUpdated.count)
          
          // Now delete the client
          await prisma.client.delete({ where: { id } })
          console.log('✅ Client deleted successfully:', id)
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