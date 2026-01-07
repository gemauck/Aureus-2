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

    // Ensure database schema supports leadId on UserTask (runtime safe)
    try {
      await prisma.$executeRaw`ALTER TABLE "UserTask" ADD COLUMN IF NOT EXISTS "leadId" TEXT`
      // Best-effort index creation
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserTask_leadId_idx" ON "UserTask"("leadId")`)
    } catch (schemaError) {
      // Non-fatal if this fails; subsequent operations may still work if column already exists
    }

    // GET /api/user-tasks - List all tasks for the user
    if (req.method === 'GET' && !taskId) {
      try {
        // Safely parse query parameters - handle empty query strings
        const queryParams = req.query || {}
        const { status, category, clientId, projectId, leadId, tagId, priority, view, includeTags, includeCategories, includeStats } = queryParams
        
        // For dashboard widget, skip expensive operations by default
        const lightweight = queryParams.lightweight === 'true' || queryParams.lightweight === true
        const shouldIncludeTags = includeTags === 'true' || includeTags === true || !lightweight
        const shouldIncludeCategories = includeCategories === 'true' || includeCategories === true || !lightweight
        const shouldIncludeStats = includeStats === 'true' || includeStats === true || !lightweight
        
        const where = { ownerId: userId }
        
        if (status) where.status = status
        if (category) where.category = category
        if (clientId) where.clientId = clientId
        if (projectId) where.projectId = projectId
        if (leadId) where.leadId = leadId
        if (priority) where.priority = priority
        if (tagId) {
          where.tags = {
            some: {
              tagId: tagId
            }
          }
        }

        // Build include object conditionally
        const include = {}
        if (shouldIncludeTags) {
          include.tags = {
            include: {
              tag: true
            }
          }
        }

        // Add pagination support to prevent loading all tasks
        const page = parseInt(queryParams.page) || 1
        const limit = parseInt(queryParams.limit) || (lightweight ? 50 : 200) // Smaller limit for lightweight mode
        const skip = (page - 1) * limit
        
        const tasks = await prisma.userTask.findMany({
          where,
          ...(Object.keys(include).length > 0 ? { include } : {}),
          orderBy: {
            createdAt: 'desc'
          },
          take: limit,
          skip: skip
        })

        const parsedTasks = tasks.map(parseUserTaskJsonFields)
        
        // Get categories for filter - only if requested (expensive query)
        // Optimized: Use fallback method first (faster) instead of expensive groupBy
        let categories = []
        if (shouldIncludeCategories) {
          try {
            // Use fallback method (extract from tasks) - much faster than groupBy
            const categorySet = new Set()
            parsedTasks.forEach(task => {
              if (task.category) categorySet.add(task.category)
            })
            categories = Array.from(categorySet)
            
            // Only use groupBy if we need ALL categories (not just from current page)
            // For lightweight mode, fallback is sufficient
            if (!lightweight && categories.length === 0) {
              const categoryGroups = await prisma.userTask.groupBy({
                by: ['category'],
                where: { 
                  ownerId: userId,
                  category: { not: null }
                }
              })
              categories = categoryGroups.map(c => c.category).filter(Boolean)
            }
          } catch (error) {
            // Fallback already handled above
            categories = []
          }
        }

        // Calculate stats - only if requested
        let stats = null
        if (shouldIncludeStats) {
          stats = {
            total: parsedTasks.length,
            todo: parsedTasks.filter(t => t.status === 'todo').length,
            inProgress: parsedTasks.filter(t => t.status === 'in-progress').length,
            completed: parsedTasks.filter(t => t.status === 'completed').length
          }
        }

        const response = {
          tasks: parsedTasks
        }
        
        if (shouldIncludeCategories) {
          response.categories = categories
        }
        
        if (stats) {
          response.stats = stats
        }

        return ok(res, response)
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
          leadId,
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
          ...(leadId && { leadId }),
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
          leadId,
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
        if (leadId !== undefined) updateData.leadId = leadId || null
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

