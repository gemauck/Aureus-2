// Tasks API endpoint - Fetch project tasks assigned to users
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, serverError, badRequest } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // GET /api/tasks - Get all tasks assigned to the current user
    if (req.method === 'GET') {
      try {
        const { status, projectId } = req.query || {}
        
        const where = { assigneeId: userId }
        
        if (status) {
          where.status = status
        }
        
        if (projectId) {
          where.projectId = projectId
        }

        const tasks = await prisma.task.findMany({
          where,
          include: {
            project: {
              select: {
                id: true,
                name: true,
                clientName: true,
                status: true
              }
            },
            assignee: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: [
            { dueDate: 'asc' },
            { createdAt: 'desc' }
          ]
        })

        return ok(res, { tasks })
      } catch (error) {
        console.error('Error fetching tasks:', error)
        return serverError(res, 'Failed to fetch tasks', error.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Tasks API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))


