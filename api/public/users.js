// Public API endpoint for job card form - returns active users without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    
    // Get only active users (not inactive or suspended)
    const users = await prisma.user.findMany({
      where: {
        status: {
          notIn: ['inactive', 'suspended']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        status: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    
    return ok(res, {
      users: users,
      count: users.length
    })
  } catch (error) {
    console.error('❌ Public users endpoint error:', error)
    return serverError(res, 'Failed to fetch users', error.message)
  }
}

export default withHttp(handler)

