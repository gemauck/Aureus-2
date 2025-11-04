// Heartbeat endpoint to track user online status
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError, badRequest, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Invalid method. Use POST.')
  }

  try {
    if (!req.user) {
      return unauthorized(res, 'Authentication required')
    }

    const userId = req.user.sub || req.user.id
    if (!userId) {
      return badRequest(res, 'User ID not found in token')
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
    // Check if it's a database connection error
    const errorMessage = error.message || String(error)
    if (errorMessage.includes("Can't reach database server") ||
        errorMessage.includes("connection") ||
        error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008' ||
        error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return serverError(res, 'Database connection failed', errorMessage)
    }
    return serverError(res, 'Failed to update heartbeat', errorMessage)
  }
}

export default withHttp(withLogging(authRequired(handler)))

