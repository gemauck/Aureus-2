// Heartbeat endpoint to track user online status
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError, badRequest, unauthorized, notFound } from '../_lib/response.js'
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
    // Use updateMany to avoid throwing error if user doesn't exist
    const updateResult = await prisma.user.updateMany({
      where: { id: userId },
      data: { lastSeenAt: new Date() }
    })

    // If no rows were updated, user doesn't exist (token might be stale)
    if (updateResult.count === 0) {
      console.warn(`⚠️ Heartbeat: User ${userId} not found in database (token may be stale)`)
      return notFound(res, 'User not found - token may be invalid')
    }

    return ok(res, { 
      success: true,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Heartbeat error:', error)
    
    // Check if it's a database connection error - comprehensive list including PrismaClientInitializationError
    const errorName = error.name || ''
    const errorMessage = error.message || String(error)
    const errorCode = error.code || ''
    
    const isConnectionError = 
      errorName === 'PrismaClientInitializationError' ||
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes("Can't reach database") ||
      (errorMessage.includes("connection") && (errorMessage.includes("timeout") || errorMessage.includes("refused") || errorMessage.includes("unreachable"))) ||
      errorCode === 'P1001' || // Can't reach database server
      errorCode === 'P1002' || // The database server is not reachable
      errorCode === 'P1008' || // Operations timed out
      errorCode === 'P1017' || // Server has closed the connection
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ECONNREFUSED' ||
      errorCode === 'ENOTFOUND' ||
      errorCode === 'EAI_AGAIN'
    
    // Check if it's a Prisma "record not found" error
    const isRecordNotFound = 
      errorCode === 'P2025' || // Record not found
      errorMessage.includes('Record to update does not exist') ||
      errorMessage.includes('No User found')
    
    if (isConnectionError) {
      return serverError(res, `Database connection failed: ${errorMessage}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
    }
    
    if (isRecordNotFound) {
      console.warn(`⚠️ Heartbeat: User not found (${req.user?.sub || 'unknown'})`)
      return notFound(res, 'User not found - token may be invalid')
    }
    
    // For other errors, return 500 but log the full error
    console.error('❌ Heartbeat: Unexpected error:', {
      name: errorName,
      message: errorMessage,
      code: errorCode,
      stack: error.stack
    })
    return serverError(res, 'Failed to update heartbeat', errorMessage)
  }
}

export default withHttp(withLogging(authRequired(handler)))

