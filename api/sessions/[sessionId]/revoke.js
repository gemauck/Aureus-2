import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { badRequest, ok, serverError, forbidden, notFound } from '../../../_lib/response.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      return badRequest(res, 'Method not allowed')
    }

    const currentUserId = req.user?.sub
    if (!currentUserId) {
      return badRequest(res, 'User not authenticated')
    }

    // Extract sessionId from URL (strip query parameters)
    const urlPath = req.url?.split('?')[0].split('#')[0]
    const urlParts = urlPath?.split('/').filter(Boolean)
    const sessionId = urlParts[urlParts.length - 1] // Last part after /sessions/

    if (!sessionId) {
      return badRequest(res, 'Session ID is required')
    }

    // Get the session
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return notFound(res, 'Session not found')
    }

    // Check permission - users can only revoke their own sessions (unless admin)
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    if (!currentUser) {
      return badRequest(res, 'User not found')
    }

    if (session.userId !== currentUserId && currentUser.role !== 'admin') {
      return forbidden(res, 'You can only revoke your own sessions')
    }

    // Delete the session
    await prisma.session.delete({
      where: { id: sessionId }
    })

    // Log security event
    try {
      await prisma.securityEvent.create({
        data: {
          userId: session.userId,
          eventType: 'session_revoked',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent'],
          details: JSON.stringify({ sessionId, revokedBy: currentUserId })
        }
      })
    } catch (e) {
      // Don't fail if logging fails
    }

    return ok(res, {
      revoked: true,
      message: 'Session revoked successfully'
    })
  } catch (error) {
    console.error('❌ Error revoking session:', error)
    return serverError(res, 'Failed to revoke session', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

