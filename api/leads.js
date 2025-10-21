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
    
    // Parse the URL path (already has /api/ stripped by server)
    const pathSegments = req.url.split('/').filter(Boolean)
    const id = pathSegments[pathSegments.length - 1]

    // List Leads (GET /api/leads)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'leads') {
      try {
        const leads = await prisma.client.findMany({ 
          where: { type: 'lead' },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Leads retrieved successfully:', leads.length, 'for all users')
        return ok(res, { leads })
      } catch (dbError) {
        console.error('❌ Database error listing leads:', dbError)
        return serverError(res, 'Failed to list leads', dbError.message)
      }
    }

    // Create Lead (POST /api/leads)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'leads') {
      const body = await parseJsonBody(req)
      console.log('🔍 Received lead creation data:', body)
      console.log('🔍 Body type:', typeof body)
      console.log('🔍 Body keys:', Object.keys(body))
      
      if (!body.name) {
        console.log('❌ Missing name field in request body')
        return badRequest(res, 'name required')
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
      const leadData = {
        name: body.name,
        type: 'lead',
        industry: body.industry || 'Other',
        status: body.status || 'Potential', // Use 'Potential' as default for leads
        revenue: parseFloat(body.revenue) || 0,
        value: parseFloat(body.value) || 0,
        probability: parseInt(body.probability) || 0,
        lastContact: body.lastContact ? new Date(body.lastContact) : new Date(),
        address: body.address || '',
        website: body.website || '',
        notes: notes,
        contacts: Array.isArray(body.contacts) ? body.contacts : [],
        followUps: Array.isArray(body.followUps) ? body.followUps : [],
        projectIds: Array.isArray(body.projectIds) ? body.projectIds : [],
        comments: Array.isArray(body.comments) ? body.comments : [],
        sites: Array.isArray(body.sites) ? body.sites : [],
        contracts: Array.isArray(body.contracts) ? body.contracts : [],
        activityLog: Array.isArray(body.activityLog) ? body.activityLog : [],
        billingTerms: typeof body.billingTerms === 'object' && body.billingTerms !== null ? body.billingTerms : {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        }
      }

      // Filter out any undefined or null values that might cause issues
      Object.keys(leadData).forEach(key => {
        if (leadData[key] === undefined || leadData[key] === null) {
          delete leadData[key]
        }
      })

      // Only add ownerId if user is authenticated
      if (req.user?.sub) {
        leadData.ownerId = req.user.sub
      }

      console.log('🔍 Creating lead with data:', leadData)
      console.log('🔍 Lead data keys:', Object.keys(leadData))
      console.log('🔍 Lead data values:', Object.values(leadData))
      
      try {
        const lead = await prisma.client.create({
          data: leadData
        })
        
        console.log('✅ Lead created successfully:', lead.id)
        return created(res, { lead })
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
