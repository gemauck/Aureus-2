import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const userId = req.user?.sub
    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // Get current session token from Authorization header
    const authHeader = req.headers.authorization
    const currentToken = authHeader?.replace('Bearer ', '')

    if (!currentToken) {
      return badRequest(res, 'Current session token is required')
    }

    // Find current session
    const currentSession = await prisma.session.findUnique({
      where: { token: currentToken }
    })

    if (!currentSession || currentSession.userId !== userId) {
      return badRequest(res, 'Current session not found or invalid')
    }

    // Delete all other sessions for this user
    const result = await prisma.session.deleteMany({
      where: {
        userId,
        id: {
          not: currentSession.id // Keep current session
        }
      }
    })

    // Log security event
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: 'sessions_revoked_all_others',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent'],
          details: JSON.stringify({ sessionsRevoked: result.count })
        }
      })
    } catch (e) {
      // Don't fail if logging fails
    }

    return ok(res, {
      revoked: result.count,
      message: `Revoked ${result.count} session(s)`
    })
  } catch (error) {
    console.error('❌ Error revoking sessions:', error)
    return serverError(res, 'Failed to revoke sessions', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

