import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'GET') return unauthorized(res, 'Invalid method')
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        provider: true,
        lastLoginAt: true
      }
    })
    if (!user) return unauthorized(res, 'User not found')
    return ok(res, { user })
  } catch (e) {
    return serverError(res, 'Me endpoint failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
