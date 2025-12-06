// Heartbeat endpoint to track user online status
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError, badRequest, unauthorized, notFound } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isConnectionError } from '../_lib/dbErrorHandler.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Invalid method. Use POST.')
  }

  try {
    // Ensure response hasn't been sent
    if (res.headersSent || res.writableEnded) {
      return
    }

    if (!req.user) {
      return unauthorized(res, 'Authentication required')
    }

    const userId = req.user.sub || req.user.id
    if (!userId) {
      return badRequest(res, 'User ID not found in token')
    }

    // Update lastSeenAt timestamp
    // Use updateMany to avoid throwing error if user doesn't exist
    // Wrap in try-catch to handle database errors gracefully
    let updateResult
    try {
      updateResult = await prisma.user.updateMany({
        where: { id: userId },
        data: { lastSeenAt: new Date() }
      })
    } catch (dbError) {
      // Check if it's a database connection error
      if (isConnectionError(dbError)) {
        // Return 503 (Service Unavailable) for database connection issues
        // Don't log as error since this is expected during DB outages
        if (!res.headersSent && !res.writableEnded) {
          return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Database connection failed. The database server is unreachable.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
            code: 'DATABASE_CONNECTION_ERROR',
            timestamp: new Date().toISOString()
          })
        }
        return
      }
      // Re-throw other database errors to be handled below
      throw dbError
    }

    // If no rows were updated, user doesn't exist (token might be stale)
    // This is not an error - just return success (heartbeat still processed)
    // We don't want to fail heartbeat just because user record doesn't exist
    if (updateResult.count === 0) {
      // Silently succeed - user might have been deleted but token is still valid
      // This prevents unnecessary 404 errors in logs
      return ok(res, { 
        success: true,
        timestamp: new Date().toISOString(),
        note: 'User record not found, but heartbeat processed'
      })
    }

    return ok(res, { 
      success: true,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    // Ensure response hasn't been sent before attempting to send error
    if (res.headersSent || res.writableEnded) {
      console.error('❌ Heartbeat: Error occurred but response already sent:', error.message)
      return
    }

    // Check if it's a database connection error using utility
    if (isConnectionError(error)) {
      // Return 503 (Service Unavailable) for database connection issues
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database connection failed. The database server is unreachable.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        code: 'DATABASE_CONNECTION_ERROR',
        timestamp: new Date().toISOString()
      })
    }
    
    // Check if it's a Prisma "record not found" error
    const errorCode = error.code || ''
    const errorMessage = error.message || String(error)
    const isRecordNotFound = 
      errorCode === 'P2025' || // Record not found
      errorMessage.includes('Record to update does not exist') ||
      errorMessage.includes('No User found')
    
    if (isRecordNotFound) {
      // Return success instead of 404 - heartbeat should not fail for missing users
      return ok(res, { 
        success: true,
        timestamp: new Date().toISOString(),
        note: 'User record not found, but heartbeat processed'
      })
    }
    
    // For other unexpected errors, log but return a graceful error
    console.error('❌ Heartbeat: Unexpected error:', {
      name: error.name,
      message: errorMessage,
      code: errorCode,
      userId: req.user?.sub || req.user?.id || 'unknown',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
    
    // Return 500 only for truly unexpected errors
    return serverError(res, 'Failed to update heartbeat', errorMessage)
  }
}

export default withHttp(withLogging(authRequired(handler)))

