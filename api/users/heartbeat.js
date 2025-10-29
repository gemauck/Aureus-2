// Heartbeat endpoint to track user online status
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userId = req.user.sub || req.user.id
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in token' })
    }

    // Update lastSeenAt timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() }
    })

    return ok(res, { 
      success: true,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Heartbeat error:', error)
    return serverError(res, 'Failed to update heartbeat', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

