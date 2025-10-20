import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Lead [id] API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })
    
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1] // Get the ID from the URL

    console.log('🔍 Path segments:', pathSegments, 'ID:', id)

    if (!id) {
      return badRequest(res, 'Lead ID required')
    }

    // Get Single Lead (GET /api/leads/[id])
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

    // Update Lead (PATCH /api/leads/[id])
    if (req.method === 'PATCH') {
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
        contacts: Array.isArray(body.contacts) ? body.contacts : undefined,
        followUps: Array.isArray(body.followUps) ? body.followUps : undefined,
        comments: Array.isArray(body.comments) ? body.comments : undefined,
        activityLog: Array.isArray(body.activityLog) ? body.activityLog : undefined
      }

      // Remove undefined values
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

    // Delete Lead (DELETE /api/leads/[id])
    if (req.method === 'DELETE') {
      try {
        await prisma.client.delete({ 
          where: { id, type: 'lead' } 
        })
        console.log('✅ Lead deleted successfully:', id)
        return ok(res, { message: 'Lead deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting lead:', dbError)
        return serverError(res, 'Failed to delete lead', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')

  } catch (error) {
    console.error('❌ Leads [id] API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
