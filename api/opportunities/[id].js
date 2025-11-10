// Opportunities API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 [ID] Handler called:', {
      method: req.method,
      url: req.url,
      params: req.params
    })
    
    // Extract ID from params or URL (strip query parameters)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const id = req.params?.id || urlPath.split('/').pop()
    
    if (!id) {
      return badRequest(res, 'Opportunity ID required')
    }
    
    console.log('🔍 Processing opportunity ID:', id)
    
    const userId = req.user?.sub || null
    let validUserId = null
    if (userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (userExists) {
          validUserId = userId
        }
      } catch (userCheckError) {
        console.warn('⚠️ [ID] Opportunities API: failed to verify user existence for starred relation', userCheckError.message)
      }
    }

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
        
        // Parse JSON fields (proposals)
        const { starredBy, ...restOpportunity } = opportunity
        const parsedOpportunity = { 
          ...restOpportunity,
          isStarred: validUserId ? Array.isArray(starredBy) && starredBy.length > 0 : false
        }
        if (typeof parsedOpportunity.proposals === 'string' && parsedOpportunity.proposals) {
          try {
            parsedOpportunity.proposals = JSON.parse(parsedOpportunity.proposals)
          } catch (e) {
            parsedOpportunity.proposals = []
          }
        } else if (!parsedOpportunity.proposals) {
          parsedOpportunity.proposals = []
        }
        
        console.log('✅ Opportunity retrieved successfully:', opportunity.id)
        console.log('✅ Parsed proposals count:', Array.isArray(parsedOpportunity.proposals) ? parsedOpportunity.proposals.length : 'not an array')
        return ok(res, { opportunity: parsedOpportunity })
      } catch (dbError) {
        console.error('❌ Database error getting opportunity:', dbError)
        return serverError(res, 'Failed to get opportunity', dbError.message)
      }
    }
    
    if (req.method === 'PUT') {
      const body = req.body || {}
      console.log('🔍 [ID] PUT Request received:', {
        id,
        body,
        bodyKeys: Object.keys(body),
        stage: body.stage,
        stageType: typeof body.stage,
        rawBody: JSON.stringify(body)
      })
      
      const updateData = {
        title: body.title,
        stage: body.stage,
        status: body.status,
        value: body.value ? parseFloat(body.value) : undefined,
        proposals: body.proposals !== undefined ? (typeof body.proposals === 'string' ? body.proposals : JSON.stringify(Array.isArray(body.proposals) ? body.proposals : [])) : undefined,
        ownerId: body.ownerId
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })
      
      console.log('🔍 Updating opportunity with data:', updateData)
      console.log('🔍 Final updateData keys:', Object.keys(updateData))
      
      try {
        // First, check if opportunity exists
        const existing = await prisma.opportunity.findUnique({ where: { id } })
        if (!existing) {
          console.error('❌ Opportunity not found:', id)
          return notFound(res, `Opportunity with ID ${id} not found`)
        }
        console.log('✅ Opportunity found:', {
          id: existing.id,
          currentStage: existing.stage,
          newStage: updateData.stage
        })
        
        const opportunity = await prisma.opportunity.update({ 
          where: { id }, 
          data: updateData 
        })
        console.log('✅ Opportunity updated successfully:', {
          id: opportunity.id,
          oldStage: existing.stage,
          newStage: opportunity.stage,
          title: opportunity.title
        })
        
        // Parse proposals before returning
        let isStarred = false
        if (validUserId) {
          const star = await prisma.starredOpportunity.findUnique({
            where: {
              userId_opportunityId: {
                userId: validUserId,
                opportunityId: opportunity.id
              }
            },
            select: { id: true }
          })
          isStarred = Boolean(star)
        }

        const parsedOpportunity = { ...opportunity, isStarred }
        if (typeof parsedOpportunity.proposals === 'string' && parsedOpportunity.proposals) {
          try {
            parsedOpportunity.proposals = JSON.parse(parsedOpportunity.proposals)
          } catch (e) {
            parsedOpportunity.proposals = []
          }
        } else if (!parsedOpportunity.proposals) {
          parsedOpportunity.proposals = []
        }
        
        return ok(res, { opportunity: parsedOpportunity })
      } catch (dbError) {
        console.error('❌ Database error updating opportunity:', dbError)
        console.error('❌ Error details:', {
          message: dbError.message,
          code: dbError.code,
          meta: dbError.meta
        })
        return serverError(res, 'Failed to update opportunity', dbError.message)
      }
    }
    
    if (req.method === 'DELETE') {
      console.log('🗑️ Deleting opportunity:', id)
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
    
    return badRequest(res, 'Invalid method for opportunity')
  } catch (e) {
    console.error('❌ [ID] Handler error:', e)
    return serverError(res, 'Opportunity handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
