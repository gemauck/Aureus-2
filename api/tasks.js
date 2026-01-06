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
        const { status, projectId, lightweight } = req.query || {}
        const isLightweight = lightweight === 'true' || lightweight === true
        
        // Get tasks from Task table (primary source - much faster)
        const where = { assigneeId: userId }
        
        if (status) {
          where.status = status
        }
        
        if (projectId) {
          where.projectId = projectId
        }

        // Helper to check if error is a connection error
        const isConnectionError = (error) => {
          return error.code === 'P1001' || 
                 error.code === 'P1002' || 
                 error.code === 'P1008' || 
                 error.code === 'P1017' ||
                 error.code === 'ETIMEDOUT' || 
                 error.code === 'ECONNREFUSED' ||
                 error.code === 'ENOTFOUND' ||
                 error.name === 'PrismaClientInitializationError' ||
                 error.message?.includes("Can't reach database server") ||
                 error.message?.includes('Too many database connections') ||
                 error.message?.includes('connection')
        }

        let tasksFromTable = []
        try {
          tasksFromTable = await prisma.task.findMany({
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
        } catch (dbError) {
          console.error('❌ Error fetching tasks from Task table:', dbError.message)
          console.error('❌ Error details:', {
            code: dbError.code,
            name: dbError.name,
            message: dbError.message
          })
          
          // For local development, allow degraded mode when database is unavailable
          const isLocalDev = process.env.NODE_ENV !== 'production' || process.env.DEV_LOCAL_NO_DB === 'true'
          
          if (isConnectionError(dbError) && isLocalDev) {
            console.warn('⚠️ Database connection issue in local dev - returning empty array (degraded mode)')
            tasksFromTable = []
          } else if (isConnectionError(dbError)) {
            console.warn('⚠️ Database connection issue - returning empty project tasks array')
            tasksFromTable = []
          } else {
            throw dbError
          }
        }

        // Also get tasks from project tasksList JSON fields
        // In lightweight mode, we still need to check tasksList because many tasks are stored there
        let tasksFromProjects = []
        try {
          // Get current user info to match by name/email as well
          const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              name: true,
              email: true
            }
          }).catch(() => null)
          
          const userMatchFields = {
            id: userId,
            name: currentUser?.name || req.user?.name || '',
            email: currentUser?.email || req.user?.email || ''
          }
          
          // Get tasks from project tasksList JSON fields
          // In lightweight mode, only fetch essential fields to reduce data transfer
          // CRITICAL: Limit project query to prevent loading all projects (major performance issue)
          const projectWhere = projectId ? { id: projectId } : {}
          // Use smaller limit in lightweight mode (dashboard widget) to improve performance
          const projectLimit = isLightweight ? 50 : (projectId ? undefined : 100)
          const projects = await prisma.project.findMany({
            where: projectWhere,
            select: {
              id: true,
              name: true,
              clientName: true,
              status: true,
              tasksList: true
            },
            // Limit to prevent performance issues - smaller limit for lightweight mode
            ...(projectLimit ? { take: projectLimit, orderBy: { updatedAt: 'desc' } } : {})
          })

          // Extract tasks from projects' tasksList JSON
          for (const project of projects) {
            if (project.tasksList) {
              try {
                const tasksList = typeof project.tasksList === 'string' 
                  ? JSON.parse(project.tasksList || '[]') 
                  : (project.tasksList || [])
                
                if (Array.isArray(tasksList)) {
                  for (const task of tasksList) {
                    // Check if task is assigned to current user
                    // Tasks can have assigneeId, assignee (as object with id/name/email or as string name), or assignedTo field
                    const taskAssigneeId = task.assigneeId || task.assignee?.id || null
                    const taskAssigneeName = typeof task.assignee === 'string' 
                      ? task.assignee 
                      : (task.assignee?.name || task.assignedTo || '')
                    const taskAssigneeEmail = task.assignee?.email || task.assignedTo || ''
                    
                    // Match by ID, name, or email
                    const isAssignedToUser = 
                      taskAssigneeId === userMatchFields.id ||
                      (userMatchFields.name && taskAssigneeName && 
                       taskAssigneeName.toLowerCase().trim() === userMatchFields.name.toLowerCase().trim()) ||
                      (userMatchFields.email && taskAssigneeEmail && 
                       taskAssigneeEmail.toLowerCase().trim() === userMatchFields.email.toLowerCase().trim())
                    
                    if (isAssignedToUser) {
                      // Only include if status filter matches (if provided)
                      if (!status || (task.status || 'todo').toLowerCase() === status.toLowerCase()) {
                        tasksFromProjects.push({
                          id: task.id || `project-${project.id}-task-${tasksList.indexOf(task)}`,
                          projectId: project.id,
                          title: task.title || task.name || 'Untitled Task',
                          status: task.status || 'todo',
                          assigneeId: taskAssigneeId || userId,
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
        } catch (dbError) {
          console.error('❌ Error fetching tasks from project tasksList:', dbError.message)
          // Don't fail completely if tasksList parsing fails - we still have tasksFromTable
          tasksFromProjects = []
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





