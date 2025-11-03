import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { searchAndSaveNewsForClient } from '../client-news/search.js'

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
        const lead = await prisma.client.findFirst({ 
          where: { id, type: 'lead' },
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        })
        if (!lead) return notFound(res)
        
        // Parse tags from ClientTag relations
        const parsedLead = {
          ...lead,
          tags: lead.tags ? lead.tags.map(ct => ct.tag).filter(Boolean) : []
        }
        
        console.log('✅ Lead retrieved successfully:', lead.id)
        return ok(res, { lead: parsedLead })
      } catch (dbError) {
        console.error('❌ Database error getting lead:', dbError)
        return serverError(res, 'Failed to get lead', dbError.message)
      }
    }

    // Update Lead (PATCH /api/leads/[id])
    if (req.method === 'PATCH') {
      const body = req.body || await parseJsonBody(req)
      console.log('🔍 Received body:', body)
      console.log('🔍 Body keys:', Object.keys(body))
      
      const updateData = {
        name: body.name,
        industry: body.industry,
        status: body.status,
        stage: body.stage,
        revenue: body.revenue !== undefined ? parseFloat(body.revenue) || 0 : undefined,
        value: body.value !== undefined ? parseFloat(body.value) || 0 : undefined,
        probability: body.probability !== undefined ? parseInt(body.probability) || 0 : undefined,
        lastContact: body.lastContact ? new Date(body.lastContact) : undefined,
        address: body.address,
        website: body.website,
        notes: body.notes !== undefined ? String(body.notes || '') : undefined,
        contacts: body.contacts !== undefined ? (typeof body.contacts === 'string' ? body.contacts : JSON.stringify(Array.isArray(body.contacts) ? body.contacts : [])) : undefined,
        followUps: body.followUps !== undefined ? (typeof body.followUps === 'string' ? body.followUps : JSON.stringify(Array.isArray(body.followUps) ? body.followUps : [])) : undefined,
        projectIds: body.projectIds !== undefined ? (typeof body.projectIds === 'string' ? body.projectIds : JSON.stringify(Array.isArray(body.projectIds) ? body.projectIds : [])) : undefined,
        comments: body.comments !== undefined ? (typeof body.comments === 'string' ? body.comments : JSON.stringify(Array.isArray(body.comments) ? body.comments : [])) : undefined,
        sites: body.sites !== undefined ? (typeof body.sites === 'string' ? body.sites : JSON.stringify(Array.isArray(body.sites) ? body.sites : [])) : undefined,
        contracts: body.contracts !== undefined ? (typeof body.contracts === 'string' ? body.contracts : JSON.stringify(Array.isArray(body.contracts) ? body.contracts : [])) : undefined,
        activityLog: body.activityLog !== undefined ? (typeof body.activityLog === 'string' ? body.activityLog : JSON.stringify(Array.isArray(body.activityLog) ? body.activityLog : [])) : undefined,
        billingTerms: body.billingTerms !== undefined ? (typeof body.billingTerms === 'string' ? body.billingTerms : JSON.stringify(body.billingTerms)) : undefined
      }

      // Remove undefined values (but keep empty strings and empty arrays as JSON strings)
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      console.log('🔍 Updating lead with data:', updateData)
      console.log('🔍 Update contains status:', updateData.status)
      console.log('🔍 Update contains contacts:', updateData.contacts ? `${typeof updateData.contacts} (length: ${updateData.contacts.length})` : 'not included')
      console.log('🔍 Update contains followUps:', updateData.followUps ? `${typeof updateData.followUps} (length: ${updateData.followUps.length})` : 'not included')
      console.log('🔍 Update contains notes:', updateData.notes !== undefined ? `string (length: ${updateData.notes.length})` : 'not included')
      console.log('🔍 Update contains comments:', updateData.comments ? `${typeof updateData.comments} (length: ${updateData.comments.length})` : 'not included')
      console.log('🔍 Lead ID to update:', id)
      
      try {
        // First verify the lead exists
        const existing = await prisma.client.findUnique({ where: { id } })
        if (!existing) {
          console.error('❌ Lead not found:', id)
          return notFound(res)
        }
        if (existing.type !== 'lead') {
          console.error('❌ Record is not a lead:', id, 'type:', existing.type)
          return badRequest(res, 'Not a lead')
        }
        console.log('🔍 Found existing lead - current status:', existing.status)
        
        // Store old name and website for RSS feed update
        const oldName = existing.name
        const oldWebsite = existing.website
        
        // Now update it
        const lead = await prisma.client.update({
          where: { id },
          data: updateData
        })
        console.log('✅ Lead updated successfully:', lead.id)
        console.log('✅ New status:', lead.status, '(was:', existing.status, ')')
        console.log('✅ Full updated lead:', JSON.stringify(lead, null, 2))
        
        // If name changed, trigger RSS feed update (async, don't wait)
        if (updateData.name !== undefined && oldName && oldName !== lead.name) {
          console.log(`📰 Lead name changed from "${oldName}" to "${lead.name}" - triggering RSS feed update`)
          // Trigger RSS search asynchronously (don't block the response)
          searchAndSaveNewsForClient(lead.id, lead.name, lead.website || oldWebsite || '').catch(error => {
            console.error('❌ Error updating RSS feed after name change:', error)
          })
        }
        
        return ok(res, { lead })
      } catch (dbError) {
        console.error('❌ Database error updating lead:', dbError)
        console.error('❌ Error code:', dbError.code, 'Meta:', dbError.meta)
        return serverError(res, 'Failed to update lead', dbError.message)
      }
    }

    // Delete Lead (DELETE /api/leads/[id])
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
