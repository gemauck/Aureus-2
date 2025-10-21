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
    
    // Extract ID from params or URL
    const id = req.params?.id || req.url.split('/').pop()
    
    if (!id) {
      return badRequest(res, 'Opportunity ID required')
    }
    
    console.log('🔍 Processing opportunity ID:', id)
    
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
