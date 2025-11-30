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
      // Query user with all fields including permissions
      const userQuery = await prisma.user.findUnique({ 
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
      if (isConnectionError(dbError)) {
        return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
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
