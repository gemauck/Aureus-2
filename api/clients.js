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
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // For /api/clients/[id]

    // List Clients (GET /api/clients)
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[1] === 'clients') {
      try {
        const clients = await prisma.client.findMany({ orderBy: { createdAt: 'desc' } })
        console.log('✅ Clients retrieved successfully:', clients.length)
        return ok(res, { clients })
      } catch (dbError) {
        console.error('❌ Database error listing clients:', dbError)
        return serverError(res, 'Failed to list clients', dbError.message)
      }
    }

    // Create Client (POST /api/clients)
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[1] === 'clients') {
      const body = await parseJsonBody(req)
      if (!body.name) return badRequest(res, 'name required')

      // Ensure type column exists in database
      try {
        await prisma.$executeRaw`ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'client'`
      } catch (error) {
        console.log('Type column already exists or error adding it:', error.message)
      }

      const clientData = {
        name: body.name,
        type: body.type || 'client', // Handle type field for leads vs clients
        industry: body.industry || 'Other',
        status: body.status || 'active',
        revenue: parseFloat(body.revenue) || 0,
        lastContact: body.lastContact ? new Date(body.lastContact) : new Date(),
        address: body.address || '',
        website: body.website || '',
        notes: body.notes || '',
        contacts: Array.isArray(body.contacts) ? body.contacts : [],
        followUps: Array.isArray(body.followUps) ? body.followUps : [],
        projectIds: Array.isArray(body.projectIds) ? body.projectIds : [],
        comments: Array.isArray(body.comments) ? body.comments : [],
        sites: Array.isArray(body.sites) ? body.sites : [],
        // opportunities: Array.isArray(body.opportunities) ? body.opportunities : [], // Removed - conflicts with relation
        contracts: Array.isArray(body.contracts) ? body.contracts : [],
        activityLog: Array.isArray(body.activityLog) ? body.activityLog : [],
        billingTerms: typeof body.billingTerms === 'object' ? body.billingTerms : {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        },
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating client with data:', clientData)
      try {
        const client = await prisma.client.create({ data: clientData })
        console.log('✅ Client created successfully:', client.id)
        return created(res, { client })
      } catch (dbError) {
        console.error('❌ Database error creating client:', dbError)
        return serverError(res, 'Failed to create client', dbError.message)
      }
    }

    // Get, Update, Delete Single Client (GET, PATCH, DELETE /api/clients/[id])
    if (pathSegments.length === 3 && pathSegments[1] === 'clients' && id) {
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
        const body = await parseJsonBody(req)
        const updateData = {
          name: body.name,
          type: body.type, // Handle type field for leads vs clients
          industry: body.industry,
          status: body.status,
          revenue: body.revenue,
          lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
          address: body.address,
          website: body.website,
          notes: body.notes,
          contacts: body.contacts,
          followUps: body.followUps,
          projectIds: body.projectIds,
          comments: body.comments,
          sites: Array.isArray(body.sites) ? body.sites : [],
          // opportunities: body.opportunities, // Removed - conflicts with relation
          contracts: body.contracts,
          activityLog: body.activityLog,
          billingTerms: body.billingTerms
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
          await prisma.client.delete({ where: { id } })
          console.log('✅ Client deleted successfully:', id)
          return ok(res, { deleted: true })
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