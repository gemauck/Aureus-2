import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      try {
        // Get unique departments from users and teams
        const users = await prisma.user.findMany({
          where: {
            department: {
              not: ''
            }
          },
          select: {
            department: true
          },
          distinct: ['department']
        })

        const teams = await prisma.team.findMany({
          select: {
            name: true
          }
        })

        const departments = [
          ...users.map(u => u.department),
          ...teams.map(t => t.name)
        ].filter((dept, index, self) => dept && self.indexOf(dept) === index).sort()

        return ok(res, { departments })
      } catch (dbError) {
        console.error('❌ Database error fetching departments:', dbError)
        return serverError(res, 'Failed to fetch departments', dbError.message)
      }
    }

    return ok(res, { departments: [] })
  } catch (error) {
    console.error('❌ Departments API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

