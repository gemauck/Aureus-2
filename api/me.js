import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
  if (req.method !== 'GET') return unauthorized(res, 'Invalid method')
  try {
    // Validate req.user exists and has sub
    if (!req.user || !req.user.sub) {
      console.error('❌ Me endpoint: req.user or req.user.sub is missing')
      console.error('❌ Me endpoint: req.user =', req.user)
      return unauthorized(res, 'Authentication required')
    }


    // Development-only shortcut to avoid DB when running locally
    if (process.env.DEV_LOCAL_NO_DB === 'true' || (req.user?.sub || '').startsWith('dev-')) {
      const user = {
        id: req.user.sub || 'dev-admin',
        email: req.user.email || 'admin@example.com',
        name: req.user.name || 'Admin User',
        role: req.user.role || 'admin',
        provider: 'local',
        lastLoginAt: new Date().toISOString(),
        mustChangePassword: false,
        phone: '',
        department: '',
        jobTitle: '',
        permissions: req.user.permissions || '[]'
      }
      return ok(res, { user })
    }

    let user
    try {
      // Add timeout to database query to fail faster on connection issues
      const DB_QUERY_TIMEOUT = 10000 // 10 seconds
      const queryPromise = prisma.user.findUnique({ 
        where: { id: req.user.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          accessibleProjectIds: true,
          provider: true,
          lastLoginAt: true,
          mustChangePassword: true,
          phone: true,
          department: true,
          jobTitle: true
        }
      })
      
      // Race the query against a timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Database query timeout: The database server did not respond in time. This may indicate a connection issue.'))
        }, DB_QUERY_TIMEOUT)
      })
      
      const userQuery = await Promise.race([queryPromise, timeoutPromise])
      
      // Use user query result directly, with fallback for permissions if null
      if (userQuery) {
        user = {
          ...userQuery,
          permissions: userQuery.permissions || '[]' // Use database value or default to empty array
        }
      }
    } catch (dbError) {
      console.error('❌ Me endpoint: Database query failed:', dbError)
      console.error('❌ Me endpoint: Error stack:', dbError.stack)
      
      // Check if it's a connection error using utility
      if (isConnectionError(dbError) || dbError.message?.includes('timeout')) {
        // Return 503 (Service Unavailable) instead of 500 for connection issues
        // This is more semantically correct and can be handled differently by clients
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database connection failed. The database server is unreachable.',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
          code: 'DATABASE_CONNECTION_ERROR',
          timestamp: new Date().toISOString()
        })
      }
      
      // Return error instead of throwing to avoid double error handling
      return serverError(res, 'Failed to query user', dbError.message)
    }

    if (!user) {
      console.error('❌ Me endpoint: User not found for id:', req.user.sub)
      return unauthorized(res, 'User not found')
    }

    return ok(res, { user })
  } catch (e) {
    console.error('❌ Me endpoint error:', e)
    console.error('❌ Me endpoint error stack:', e.stack)
    return serverError(res, 'Me endpoint failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
