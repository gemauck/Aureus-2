import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { badRequest, ok, serverError, forbidden } from '../../../_lib/response.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return badRequest(res, 'Method not allowed')
    }

    const currentUserId = req.user?.sub
    const requestedUserId = req.url?.split('/').pop() || req.query?.userId

    if (!currentUserId) {
      return badRequest(res, 'User not authenticated')
    }

    // Users can only view their own sessions (unless admin)
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    })

    if (!currentUser) {
      return badRequest(res, 'User not found')
    }

    const targetUserId = requestedUserId || currentUserId

    // Check permission
    if (targetUserId !== currentUserId && currentUser.role !== 'admin') {
      return forbidden(res, 'You can only view your own sessions')
    }

    // Get all active sessions for the user
    const sessions = await prisma.session.findMany({
      where: {
        userId: targetUserId,
        expiresAt: {
          gt: new Date() // Only active sessions
        }
      },
      orderBy: {
        lastActiveAt: 'desc'
      }
    })

    return ok(res, {
      sessions: sessions.map(s => ({
        id: s.id,
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        location: s.location,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt
      }))
    })
  } catch (error) {
    console.error('❌ Error fetching sessions:', error)
    return serverError(res, 'Failed to fetch sessions', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

