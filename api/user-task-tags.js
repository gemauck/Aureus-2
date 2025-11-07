import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '')
    const pathSegments = urlPath.split('/').filter(Boolean)
    // Use req.params.id if available (from explicit routes), otherwise parse from URL
    const tagId = req.params?.id || (pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : null)
    const userId = req.user?.sub

    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // GET /api/user-task-tags - List all tags for the user
    if (req.method === 'GET' && !tagId) {
      try {
        const tags = await prisma.userTaskTag.findMany({
          where: { ownerId: userId },
          include: {
            tasks: {
              include: {
                task: true
              }
            }
          },
          orderBy: {
            name: 'asc'
          }
        })

        const tagsWithCount = tags.map(tag => ({
          ...tag,
          taskCount: tag.tasks.length
        }))

        return ok(res, { tags: tagsWithCount })
      } catch (error) {
        console.error('Error fetching tags:', error)
        return serverError(res, 'Failed to fetch tags', error.message)
      }
    }

    // GET /api/user-task-tags/[id] - Get single tag
    if (req.method === 'GET' && tagId) {
      try {
        const tag = await prisma.userTaskTag.findFirst({
          where: {
            id: tagId,
            ownerId: userId
          },
          include: {
            tasks: {
              include: {
                task: true
              }
            }
          }
        })

        if (!tag) {
          return notFound(res, 'Tag not found')
        }

        return ok(res, { tag })
      } catch (error) {
        console.error('Error fetching tag:', error)
        return serverError(res, 'Failed to fetch tag', error.message)
      }
    }

    // POST /api/user-task-tags - Create new tag
    if (req.method === 'POST' && !tagId) {
      try {
        const payload = await parseJsonBody(req)
        const { name, color = '#3B82F6' } = payload

        if (!name || !name.trim()) {
          return badRequest(res, 'Tag name is required')
        }

        // Check if tag with same name already exists for this user
        const existingTag = await prisma.userTaskTag.findUnique({
          where: {
            ownerId_name: {
              ownerId: userId,
              name: name.trim()
            }
          }
        })

        if (existingTag) {
          return badRequest(res, 'Tag with this name already exists')
        }

        const tag = await prisma.userTaskTag.create({
          data: {
            name: name.trim(),
            color: color.trim(),
            ownerId: userId
          }
        })

        return created(res, { tag })
      } catch (error) {
        if (error.code === 'P2002') {
          return badRequest(res, 'Tag with this name already exists')
        }
        console.error('Error creating tag:', error)
        return serverError(res, 'Failed to create tag', error.message)
      }
    }

    // PUT /api/user-task-tags/[id] - Update tag
    if (req.method === 'PUT' && tagId) {
      try {
        const payload = await parseJsonBody(req)
        const { name, color } = payload

        // Verify tag exists and belongs to user
        const existingTag = await prisma.userTaskTag.findFirst({
          where: {
            id: tagId,
            ownerId: userId
          }
        })

        if (!existingTag) {
          return notFound(res, 'Tag not found')
        }

        const updateData = {}
        if (name !== undefined) updateData.name = name.trim()
        if (color !== undefined) updateData.color = color.trim()

        // Check for duplicate name if name is being changed
        if (name && name.trim() !== existingTag.name) {
          const duplicateTag = await prisma.userTaskTag.findUnique({
            where: {
              ownerId_name: {
                ownerId: userId,
                name: name.trim()
              }
            }
          })

          if (duplicateTag) {
            return badRequest(res, 'Tag with this name already exists')
          }
        }

        const tag = await prisma.userTaskTag.update({
          where: { id: tagId },
          data: updateData
        })

        return ok(res, { tag })
      } catch (error) {
        if (error.code === 'P2002') {
          return badRequest(res, 'Tag with this name already exists')
        }
        console.error('Error updating tag:', error)
        return serverError(res, 'Failed to update tag', error.message)
      }
    }

    // DELETE /api/user-task-tags/[id] - Delete tag
    if (req.method === 'DELETE' && tagId) {
      try {
        const tag = await prisma.userTaskTag.findFirst({
          where: {
            id: tagId,
            ownerId: userId
          }
        })

        if (!tag) {
          return notFound(res, 'Tag not found')
        }

        await prisma.userTaskTag.delete({
          where: { id: tagId }
        })

        return ok(res, { message: 'Tag deleted successfully' })
      } catch (error) {
        console.error('Error deleting tag:', error)
        return serverError(res, 'Failed to delete tag', error.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('User task tags API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

