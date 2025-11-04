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
    // Check if it's a database connection error - comprehensive list
    const errorMessage = error.message || String(error)
    const isConnectionError = 
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes("Can't reach database") ||
      (errorMessage.includes("connection") && (errorMessage.includes("timeout") || errorMessage.includes("refused") || errorMessage.includes("unreachable"))) ||
      error.code === 'P1001' || // Can't reach database server
      error.code === 'P1002' || // The database server is not reachable
      error.code === 'P1008' || // Operations timed out
      error.code === 'P1017' || // Server has closed the connection
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'EAI_AGAIN'
    
    if (isConnectionError) {
      return serverError(res, `Database connection failed: ${errorMessage}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
    }
    return serverError(res, 'Failed to update heartbeat', errorMessage)
  }
}

export default withHttp(withLogging(authRequired(handler)))

