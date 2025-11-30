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
        
        // Get tasks from Task table
        const where = { assigneeId: userId }
        
        if (status) {
          where.status = status
        }
        
        if (projectId) {
          where.projectId = projectId
        }

        const tasksFromTable = await prisma.task.findMany({
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

        // Also get tasks from project tasksList JSON fields
        const projectWhere = projectId ? { id: projectId } : {}
        const projects = await prisma.project.findMany({
          where: projectWhere,
          select: {
            id: true,
            name: true,
            clientName: true,
            status: true,
            tasksList: true
          }
        })

        // Extract tasks from projects' tasksList JSON
        const tasksFromProjects = []
        for (const project of projects) {
          if (project.tasksList) {
            try {
              const tasksList = typeof project.tasksList === 'string' 
                ? JSON.parse(project.tasksList || '[]') 
                : (project.tasksList || [])
              
              if (Array.isArray(tasksList)) {
                for (const task of tasksList) {
                  // Check if task is assigned to current user
                  // Tasks can have assigneeId, assignee, or assignedTo field
                  const taskAssigneeId = task.assigneeId || task.assignee?.id || task.assignedTo
                  if (taskAssigneeId === userId) {
                    // Only include if status filter matches (if provided)
                    if (!status || (task.status || 'todo').toLowerCase() === status.toLowerCase()) {
                      tasksFromProjects.push({
                        id: task.id || `project-${project.id}-task-${tasksList.indexOf(task)}`,
                        projectId: project.id,
                        title: task.title || task.name || 'Untitled Task',
                        status: task.status || 'todo',
                        assigneeId: taskAssigneeId,
                        dueDate: task.dueDate ? new Date(task.dueDate) : null,
                        createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
                        updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(),
                        project: {
                          id: project.id,
                          name: project.name,
                          clientName: project.clientName,
                          status: project.status
                        },
                        assignee: task.assignee || null
                      })
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`Failed to parse tasksList for project ${project.id}:`, e)
            }
          }
        }

        // Combine tasks from both sources and remove duplicates
        const allTasks = [...tasksFromTable, ...tasksFromProjects]
        // Remove duplicates based on task ID
        const uniqueTasks = Array.from(
          new Map(allTasks.map(task => [task.id, task])).values()
        )

        // Sort by due date, then by creation date
        uniqueTasks.sort((a, b) => {
          if (a.dueDate && b.dueDate) {
            return new Date(a.dueDate) - new Date(b.dueDate)
          }
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return new Date(b.createdAt) - new Date(a.createdAt)
        })

        return ok(res, { tasks: uniqueTasks })
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





