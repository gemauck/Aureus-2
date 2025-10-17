import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        provider: true,
        lastLoginAt: true
      }
    })
    return ok(res, { 
      message: "Database connection working!",
      users: users,
      count: users.length
    })
  } catch (e) {
    return serverError(res, 'Database test failed', e.message)
  }
}

export default withHttp(withLogging(handler))
