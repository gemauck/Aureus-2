// Leads API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Leads API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Leads (GET /api/leads)
    if (req.method === 'GET' && pathSegments.length === 2 && pathSegments[1] === 'leads') {
      try {
        const leads = await prisma.client.findMany({ 
          where: { type: 'lead' },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Leads retrieved successfully:', leads.length)
        return ok(res, leads)
      } catch (dbError) {
        console.error('❌ Database error listing leads:', dbError)
        return serverError(res, 'Failed to list leads', dbError.message)
      }
    }

    // Create Lead (POST /api/leads)
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[1] === 'leads') {
      const body = await parseJsonBody(req)
      if (!body.name) return badRequest(res, 'name required')

      const leadData = {
        name: body.name,
        type: 'lead',
        industry: body.industry || 'Other',
        status: body.status || 'New',
        revenue: parseFloat(body.revenue) || 0,
        value: parseFloat(body.value) || 0,
        probability: parseInt(body.probability) || 0,
        lastContact: body.lastContact ? new Date(body.lastContact) : new Date(),
        address: body.address || '',
        website: body.website || '',
        notes: body.notes || '',
        contacts: Array.isArray(body.contacts) ? body.contacts : [],
        followUps: Array.isArray(body.followUps) ? body.followUps : [],
        comments: Array.isArray(body.comments) ? body.comments : [],
        activityLog: Array.isArray(body.activityLog) ? body.activityLog : [],
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating lead with data:', leadData)
      try {
        const result = await prisma.$queryRaw`
          INSERT INTO "Client" (
            "id", "name", "type", "industry", "status", "revenue", "value", "probability",
            "lastContact", "address", "website", "notes", "contacts", "followUps",
            "comments", "activityLog", "ownerId", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid()::text, ${leadData.name}, ${leadData.type}, ${leadData.industry},
            ${leadData.status}, ${leadData.revenue}, ${leadData.value}, ${leadData.probability},
            ${leadData.lastContact}, ${leadData.address}, ${leadData.website}, ${leadData.notes},
            ${JSON.stringify(leadData.contacts)}, ${JSON.stringify(leadData.followUps)},
            ${JSON.stringify(leadData.comments)}, ${JSON.stringify(leadData.activityLog)},
            ${leadData.ownerId}, NOW(), NOW()
          ) RETURNING *
        `
        
        const lead = result[0]
        console.log('✅ Lead created successfully:', lead.id)
        return created(res, { lead })
      } catch (dbError) {
        console.error('❌ Database error creating lead:', dbError)
        return serverError(res, 'Failed to create lead', dbError.message)
      }
    }

    // Get, Update, Delete Single Lead (GET, PUT, DELETE /api/leads/[id])
    if (pathSegments.length === 3 && pathSegments[1] === 'leads' && id) {
      if (req.method === 'GET') {
        try {
          const lead = await prisma.client.findUnique({ 
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
      if (req.method === 'PUT') {
        const body = await parseJsonBody(req)
        const updateData = {
          name: body.name,
          industry: body.industry,
          status: body.status,
          revenue: body.revenue,
          value: body.value,
          probability: body.probability,
          lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
          address: body.address,
          website: body.website,
          notes: body.notes,
          contacts: body.contacts,
          followUps: body.followUps,
          comments: body.comments,
          activityLog: body.activityLog
        }
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating lead with data:', updateData)
        try {
          const lead = await prisma.client.update({ 
            where: { id, type: 'lead' }, 
            data: updateData 
          })
          console.log('✅ Lead updated successfully:', lead.id)
          return ok(res, { lead })
        } catch (dbError) {
          console.error('❌ Database error updating lead:', dbError)
          return serverError(res, 'Failed to update lead', dbError.message)
        }
      }
      if (req.method === 'DELETE') {
        try {
          await prisma.client.delete({ 
            where: { id, type: 'lead' } 
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
