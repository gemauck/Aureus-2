// Opportunities API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Opportunities API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user,
      params: req.params
    })
    
    // Parse the URL path (handle both /api/opportunities/... and /opportunities/...)
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0]
    let pathSegments = urlPath.split('/').filter(Boolean)
    // Remove 'api' from the beginning if present
    if (pathSegments[0] === 'api') {
      pathSegments = pathSegments.slice(1)
    }
    const id = req.params?.id || pathSegments[pathSegments.length - 1]
    
    console.log('🔍 Path analysis:', {
      url: req.url,
      pathSegments,
      id,
      params: req.params,
      method: req.method
    })

    // List Opportunities (GET /api/opportunities)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'opportunities') {
      try {
        const opportunities = await prisma.opportunity.findMany({ 
          include: {
            client: {
              select: {
                id: true,
                name: true,
                type: true
              }
            }
          },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Opportunities retrieved successfully:', opportunities.length)
        return ok(res, { opportunities })
      } catch (dbError) {
        console.error('❌ Database error listing opportunities:', dbError)
        return serverError(res, 'Failed to list opportunities', dbError.message)
      }
    }

    // Get Opportunities by Client (GET /api/opportunities/client/[clientId])
    // Handle both direct URL and Express route parameter
    const clientId = req.params?.clientId || (pathSegments.length === 3 && pathSegments[0] === 'opportunities' && pathSegments[1] === 'client' ? pathSegments[2] : null)
    
    if (req.method === 'GET' && clientId) {
      try {
        console.log('🔍 Opportunities API: Fetching opportunities for clientId:', clientId)
        console.log('🔍 Prisma client available:', !!prisma, 'opportunity model available:', !!prisma?.opportunity)
        
        const opportunities = await prisma.opportunity.findMany({ 
          where: { clientId },
          orderBy: { createdAt: 'desc' } 
        })
        console.log('✅ Client opportunities retrieved successfully:', opportunities.length, 'for client:', clientId)
        if (opportunities.length > 0) {
          console.log('📋 Opportunity details:', opportunities.map(o => ({ id: o.id, title: o.title, stage: o.stage, clientId: o.clientId, value: o.value })))
        } else {
          console.log('⚠️ No opportunities found for client:', clientId)
          // Check if ANY opportunities exist in database
          const allOpps = await prisma.opportunity.findMany({ take: 10 })
          console.log('📊 Total opportunities in database:', allOpps.length)
          if (allOpps.length > 0) {
            console.log('📋 All opportunities clientIds:', allOpps.map(o => ({ id: o.id, title: o.title, clientId: o.clientId })))
            console.log('🔍 Searching for clientId match:', clientId)
            const matching = allOpps.filter(o => o.clientId === clientId)
            console.log('🔍 Matches found:', matching.length, matching)
          }
        }
        return ok(res, { opportunities })
      } catch (dbError) {
        console.error('❌ Database error getting client opportunities:', {
          error: dbError.message,
          errorName: dbError.name,
          errorCode: dbError.code,
          stack: dbError.stack,
          clientId: clientId
        })
        return serverError(res, 'Failed to get client opportunities', dbError.message)
      }
    }

    // Create Opportunity (POST /api/opportunities)
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'opportunities') {
      const body = req.body || {}
      console.log('🔍 Server received opportunity creation request:', {
        body,
        bodyKeys: Object.keys(body),
        title: body.title,
        titleType: typeof body.title,
        titleLength: body.title?.length,
        clientId: body.clientId,
        stage: body.stage,
        value: body.value
      });
      if (!body.title) return badRequest(res, 'title required')
      if (!body.clientId) return badRequest(res, 'clientId required')

      // Verify client exists
      const client = await prisma.client.findUnique({ where: { id: body.clientId } })
      if (!client) return badRequest(res, 'Client not found')

      const opportunityData = {
        title: body.title,
        clientId: body.clientId,
        stage: body.stage || 'Awareness', // Use AIDA pipeline stage instead of 'prospect'
        value: parseFloat(body.value) || 0,
        ownerId: req.user?.sub || null
      }

      console.log('🔍 Creating opportunity with data:', opportunityData)
      console.log('🔍 Prisma client available:', !!prisma, 'opportunity model available:', !!prisma?.opportunity)
      try {
        const opportunity = await prisma.opportunity.create({
          data: opportunityData
        })
        
        console.log('✅ Opportunity created successfully:', opportunity.id)
        return created(res, { opportunity })
      } catch (dbError) {
        console.error('❌ Database error creating opportunity:', {
          error: dbError.message,
          errorName: dbError.name,
          errorCode: dbError.code,
          stack: dbError.stack,
          opportunityData: opportunityData
        })
        return serverError(res, 'Failed to create opportunity', dbError.message)
      }
    }

    // Get, Update, Delete Single Opportunity (GET, PUT, DELETE /api/opportunities/[id])
    // Check if this is a single opportunity operation (either by path segments or Express params)
    const isSingleOpportunity = (pathSegments.length === 2 && pathSegments[0] === 'opportunities' && id) || 
                               (req.params?.id && pathSegments[0] === 'opportunities')
    
    console.log('🔍 Single opportunity check:', {
      pathSegmentsLength: pathSegments.length,
      firstSegment: pathSegments[0],
      id,
      hasParamsId: !!req.params?.id,
      isSingleOpportunity
    })
    
    if (isSingleOpportunity) {
      if (req.method === 'GET') {
        try {
          const opportunity = await prisma.opportunity.findUnique({ 
            where: { id },
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  type: true
                }
              }
            }
          })
          if (!opportunity) return notFound(res)
          console.log('✅ Opportunity retrieved successfully:', opportunity.id)
          return ok(res, { opportunity })
        } catch (dbError) {
          console.error('❌ Database error getting opportunity:', dbError)
          return serverError(res, 'Failed to get opportunity', dbError.message)
        }
      }
      
      if (req.method === 'PUT') {
        const body = req.body || {}
        const updateData = {
          title: body.title,
          stage: body.stage,
          value: body.value ? parseFloat(body.value) : undefined,
          ownerId: body.ownerId
        }
        
        // Remove undefined values
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        console.log('🔍 Updating opportunity with data:', updateData)
        try {
          const opportunity = await prisma.opportunity.update({ 
            where: { id }, 
            data: updateData 
          })
          console.log('✅ Opportunity updated successfully:', opportunity.id)
          return ok(res, { opportunity })
        } catch (dbError) {
          console.error('❌ Database error updating opportunity:', dbError)
          return serverError(res, 'Failed to update opportunity', dbError.message)
        }
      }
      
      if (req.method === 'DELETE') {
        try {
          await prisma.opportunity.delete({ 
            where: { id } 
          })
          console.log('✅ Opportunity deleted successfully:', id)
          return ok(res, { deleted: true })
        } catch (dbError) {
          console.error('❌ Database error deleting opportunity:', dbError)
          return serverError(res, 'Failed to delete opportunity', dbError.message)
        }
      }
    }

    return badRequest(res, 'Invalid method or opportunity action')
  } catch (e) {
    return serverError(res, 'Opportunity handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
