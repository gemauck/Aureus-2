import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

// Helper function to parse JSON fields from database responses
function parseUserTaskJsonFields(task) {
  try {
    const jsonFields = ['checklist', 'photos', 'files']
    const parsed = { ...task }
    
    // Extract tags from UserTaskTagRelation if present
    if (task.tags && Array.isArray(task.tags)) {
      parsed.tags = task.tags.map(tr => tr.tag).filter(Boolean)
    } else {
      parsed.tags = []
    }
    
    // Parse JSON fields
    for (const field of jsonFields) {
      const value = parsed[field]
      if (typeof value === 'string' && value) {
        try {
          parsed[field] = JSON.parse(value)
        } catch (e) {
          parsed[field] = []
        }
      } else if (!value) {
        parsed[field] = []
      }
    }
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing task ${task.id}:`, error.message)
    return task
  }
}

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const pathSegments = urlPath.split('/').filter(Boolean)
    // Use req.params.id if available (from explicit routes), otherwise parse from URL
    const taskId = req.params?.id || (pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : null)
    const userId = req.user?.sub

    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // GET /api/user-tasks - List all tasks for the user
    if (req.method === 'GET' && !taskId) {
      try {
        const { status, category, clientId, projectId, tagId, priority, view } = req.query || {}
        
        const where = { ownerId: userId }
        
        if (status) where.status = status
        if (category) where.category = category
        if (clientId) where.clientId = clientId
        if (projectId) where.projectId = projectId
        if (priority) where.priority = priority
        if (tagId) {
          where.tags = {
            some: {
              tagId: tagId
            }
          }
        }

        const tasks = await prisma.userTask.findMany({
          where,
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })

        const parsedTasks = tasks.map(parseUserTaskJsonFields)
        
        // Get categories for filter
        const categories = await prisma.userTask.findMany({
          where: { ownerId: userId },
          select: { category: true },
          distinct: ['category']
        })

        return ok(res, {
          tasks: parsedTasks,
          categories: categories.map(c => c.category).filter(Boolean),
          stats: {
            total: parsedTasks.length,
            todo: parsedTasks.filter(t => t.status === 'todo').length,
            inProgress: parsedTasks.filter(t => t.status === 'in-progress').length,
            completed: parsedTasks.filter(t => t.status === 'completed').length
          }
        })
      } catch (error) {
        console.error('Error fetching tasks:', error)
        return serverError(res, 'Failed to fetch tasks', error.message)
      }
    }

    // GET /api/user-tasks/[id] - Get single task
    if (req.method === 'GET' && taskId) {
      try {
        const task = await prisma.userTask.findFirst({
          where: {
            id: taskId,
            ownerId: userId
          },
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        })

        if (!task) {
          return notFound(res, 'Task not found')
        }

        return ok(res, { task: parseUserTaskJsonFields(task) })
      } catch (error) {
        console.error('Error fetching task:', error)
        return serverError(res, 'Failed to fetch task', error.message)
      }
    }

    // POST /api/user-tasks - Create new task
    if (req.method === 'POST' && !taskId) {
      try {
        const payload = await parseJsonBody(req)
        const {
          title,
          description = '',
          status = 'todo',
          priority = 'medium',
          category = '',
          dueDate,
          clientId,
          projectId,
          checklist = [],
          photos = [],
          files = [],
          tagIds = [],
          googleEventId,
          googleEventUrl
        } = payload

        if (!title || !title.trim()) {
          return badRequest(res, 'Title is required')
        }

        const taskData = {
          title: title.trim(),
          description: description.trim(),
          status,
          priority,
          category: category.trim(),
          ownerId: userId,
          checklist: JSON.stringify(Array.isArray(checklist) ? checklist : []),
          photos: JSON.stringify(Array.isArray(photos) ? photos : []),
          files: JSON.stringify(Array.isArray(files) ? files : []),
          ...(dueDate && { dueDate: new Date(dueDate) }),
          ...(clientId && { clientId }),
          ...(projectId && { projectId }),
          ...(googleEventId && { googleEventId }),
          ...(googleEventUrl && { googleEventUrl })
        }

        const task = await prisma.userTask.create({
          data: taskData
        })

        // Handle tags separately if provided
        if (tagIds && tagIds.length > 0) {
          await prisma.userTaskTagRelation.createMany({
            data: tagIds.map(tagId => ({
              taskId: task.id,
              tagId: tagId
            })),
            skipDuplicates: true
          })
        }

        const createdTask = await prisma.userTask.findUnique({
          where: { id: task.id },
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        })

        return created(res, { task: parseUserTaskJsonFields(createdTask) })
      } catch (error) {
        console.error('Error creating task:', error)
        return serverError(res, 'Failed to create task', error.message)
      }
    }

    // PUT /api/user-tasks/[id] - Update task
    if (req.method === 'PUT' && taskId) {
      try {
        const payload = await parseJsonBody(req)
        const {
          title,
          description,
          status,
          priority,
          category,
          dueDate,
          clientId,
          projectId,
          checklist,
          photos,
          files,
          tagIds,
          completedDate,
          googleEventId,
          googleEventUrl
        } = payload

        // Verify task exists and belongs to user
        const existingTask = await prisma.userTask.findFirst({
          where: {
            id: taskId,
            ownerId: userId
          }
        })

        if (!existingTask) {
          return notFound(res, 'Task not found')
        }

        const updateData = {}
        if (title !== undefined) updateData.title = title.trim()
        if (description !== undefined) updateData.description = description.trim()
        if (status !== undefined) {
          updateData.status = status
          // Set completedDate if status is completed
          if (status === 'completed' && !existingTask.completedDate) {
            updateData.completedDate = new Date()
          } else if (status !== 'completed') {
            updateData.completedDate = null
          }
        }
        if (priority !== undefined) updateData.priority = priority
        if (category !== undefined) updateData.category = category.trim()
        if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
        if (clientId !== undefined) updateData.clientId = clientId || null
        if (projectId !== undefined) updateData.projectId = projectId || null
        if (checklist !== undefined) updateData.checklist = JSON.stringify(Array.isArray(checklist) ? checklist : [])
        if (photos !== undefined) updateData.photos = JSON.stringify(Array.isArray(photos) ? photos : [])
        if (files !== undefined) updateData.files = JSON.stringify(Array.isArray(files) ? files : [])
        if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null
        if (googleEventId !== undefined) updateData.googleEventId = googleEventId || null
        if (googleEventUrl !== undefined) updateData.googleEventUrl = googleEventUrl || null

        const task = await prisma.userTask.update({
          where: { id: taskId },
          data: updateData,
          include: {
            tags: {
              include: {
                tag: true
              }
            }
          }
        })

        // Update tags if provided
        if (tagIds !== undefined) {
          // Delete existing tag relations
          await prisma.userTaskTagRelation.deleteMany({
            where: { taskId: taskId }
          })

          // Create new tag relations
          if (Array.isArray(tagIds) && tagIds.length > 0) {
            await prisma.userTaskTagRelation.createMany({
              data: tagIds.map(tId => ({
                taskId: taskId,
                tagId: tId
              })),
              skipDuplicates: true
            })
          }

          // Reload task with updated tags
          const updatedTask = await prisma.userTask.findUnique({
            where: { id: taskId },
            include: {
              tags: {
                include: {
                  tag: true
                }
              }
            }
          })

          return ok(res, { task: parseUserTaskJsonFields(updatedTask) })
        }

        return ok(res, { task: parseUserTaskJsonFields(task) })
      } catch (error) {
        console.error('Error updating task:', error)
        return serverError(res, 'Failed to update task', error.message)
      }
    }

    // DELETE /api/user-tasks/[id] - Delete task
    if (req.method === 'DELETE' && taskId) {
      try {
        const task = await prisma.userTask.findFirst({
          where: {
            id: taskId,
            ownerId: userId
          }
        })

        if (!task) {
          return notFound(res, 'Task not found')
        }

        await prisma.userTask.delete({
          where: { id: taskId }
        })

        return ok(res, { message: 'Task deleted successfully' })
      } catch (error) {
        console.error('Error deleting task:', error)
        return serverError(res, 'Failed to delete task', error.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('User tasks API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

