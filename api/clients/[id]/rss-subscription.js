// RSS Subscription Management API
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  try {
    // Extract client ID from req.params (set by explicit route mapping) or URL path
    const clientId = req.params?.id || (() => {
      const urlPath = req.url.split('?')[0]
      const pathParts = urlPath.replace(/^\/api\/clients\//, '').split('/')
      return pathParts[0]
    })()
    
    console.log('🔍 RSS Subscription API:', {
      method: req.method,
      url: req.url,
      clientId,
      params: req.params
    })

    if (!clientId) {
      return badRequest(res, 'Client ID required')
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    })

    if (!client) {
      return notFound(res, 'Client not found')
    }

    // POST /api/clients/[id]/rss-subscription - Update subscription status
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req)
        const { subscribed } = body

        if (typeof subscribed !== 'boolean') {
          return badRequest(res, 'subscribed must be a boolean')
        }

        // Update client's RSS subscription status
        const updated = await prisma.client.update({
          where: { id: clientId },
          data: {
            rssSubscribed: subscribed
          },
          select: {
            id: true,
            name: true,
            rssSubscribed: true
          }
        })

        console.log(`✅ RSS subscription updated for ${updated.name}: ${subscribed}`)
        return ok(res, { 
          client: updated,
          message: subscribed ? 'Subscribed to news feed' : 'Unsubscribed from news feed'
        })
      } catch (dbError) {
        console.error('❌ Database error updating RSS subscription:', dbError)
        return serverError(res, 'Failed to update subscription', dbError.message)
      }
    }

    // GET /api/clients/[id]/rss-subscription - Get subscription status
    if (req.method === 'GET') {
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: {
            id: true,
            name: true,
            rssSubscribed: true
          }
        })

        if (!client) {
          return notFound(res)
        }

        return ok(res, { 
          client: {
            id: client.id,
            name: client.name,
            rssSubscribed: client.rssSubscribed !== false // Default to true if null
          }
        })
      } catch (dbError) {
        console.error('❌ Database error getting RSS subscription:', dbError)
        return serverError(res, 'Failed to get subscription', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ RSS Subscription API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))

