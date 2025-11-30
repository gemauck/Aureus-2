// Opportunities API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    
    // Parse the URL path (handle both /api/opportunities/... and /opportunities/...)
    // Strip query parameters before splitting
    const urlPath = req.url.split('?')[0].split('#')[0]
    let pathSegments = urlPath.split('/').filter(Boolean)
    // Remove 'api' from the beginning if present
    if (pathSegments[0] === 'api') {
      pathSegments = pathSegments.slice(1)
    }
    const id = req.params?.id || pathSegments[pathSegments.length - 1]
    

    const userId = req.user?.sub || null
    let validUserId = null
    if (userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (userExists) {
          validUserId = userId
        } else {
          console.warn('⚠️ Opportunities API: user not found in database, skipping starred relation include', userId)
        }
      } catch (userCheckError) {
        console.warn('⚠️ Opportunities API: failed to verify user existence for starred relation', userCheckError.message)
      }
    }

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
            },
            ...(validUserId ? {
              starredBy: {
                where: { userId: validUserId },
                select: { id: true }
              }
            } : {})
          },
          orderBy: { createdAt: 'desc' } 
        })
        const normalized = opportunities.map(opportunity => {
          const { starredBy, ...rest } = opportunity
          return {
            ...rest,
            isStarred: validUserId ? Array.isArray(starredBy) && starredBy.length > 0 : false
          }
        })
        return ok(res, { opportunities: normalized })
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
        
        const opportunities = await prisma.opportunity.findMany({ 
          where: { clientId },
          include: {
            ...(validUserId ? {
              starredBy: {
                where: { userId: validUserId },
                select: { id: true }
              }
            } : {})
          },
          orderBy: { createdAt: 'desc' } 
        })
        if (opportunities.length > 0) {
        } else {
          // Check if ANY opportunities exist in database
          const allOpps = await prisma.opportunity.findMany({ take: 10 })
          if (allOpps.length > 0) {
            const matching = allOpps.filter(o => o.clientId === clientId)
          }
        }
        const normalized = opportunities.map(opportunity => {
          const { starredBy, ...rest } = opportunity
          return {
            ...rest,
            isStarred: validUserId ? Array.isArray(starredBy) && starredBy.length > 0 : false
          }
        })
        return ok(res, { opportunities: normalized })
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
      if (!body.title) return badRequest(res, 'title required')
      if (!body.clientId) return badRequest(res, 'clientId required')

      // Verify client exists
      const client = await prisma.client.findUnique({ where: { id: body.clientId } })
      if (!client) return badRequest(res, 'Client not found')

      const opportunityData = {
        title: body.title,
        clientId: body.clientId,
        stage: body.stage || 'Awareness', // Use AIDA pipeline stage instead of 'prospect'
        status: body.status || 'Potential',
        value: parseFloat(body.value) || 0,
        ownerId: req.user?.sub || null
      }

      try {
        const opportunity = await prisma.opportunity.create({
          data: opportunityData
        })
        
        return created(res, { opportunity: { ...opportunity, isStarred: false } })
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
              },
              ...(validUserId ? {
                starredBy: {
                  where: { userId: validUserId },
                  select: { id: true }
                }
              } : {})
            }
          })
          if (!opportunity) return notFound(res)
          const { starredBy, ...rest } = opportunity
          return ok(res, { 
            opportunity: {
              ...rest,
              isStarred: validUserId ? Array.isArray(starredBy) && starredBy.length > 0 : false
            }
          })
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
          status: body.status,
          value: body.value ? parseFloat(body.value) : undefined,
          ownerId: body.ownerId
        }
        
        // Remove undefined values
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key]
          }
        })
        
        try {
          const opportunity = await prisma.opportunity.update({ 
            where: { id }, 
            data: updateData 
          })

          let isStarred = false
          if (validUserId) {
            const star = await prisma.starredOpportunity.findUnique({
              where: {
                userId_opportunityId: {
                  userId: validUserId,
                  opportunityId: opportunity.id
                }
              }
            })
            isStarred = Boolean(star)
          }

          return ok(res, { 
            opportunity: {
              ...opportunity,
              isStarred
            }
          })
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
