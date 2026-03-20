import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

const DEFAULT_LISTS = [
  { name: 'To do', order: 0, status: 'todo' },
  { name: 'In progress', order: 1, status: 'in-progress' },
  { name: 'Completed', order: 2, status: 'completed' },
  { name: 'Cancelled', order: 3, status: 'cancelled' }
]

async function ensureDefaultLists(ownerId) {
  const existing = await prisma.userTaskList.findMany({
    where: { ownerId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }]
  })
  if (existing.length > 0) return existing
  const created = await prisma.$transaction(
    DEFAULT_LISTS.map((item, i) =>
      prisma.userTaskList.create({
        data: {
          ownerId,
          name: item.name,
          order: item.order,
          status: item.status,
          color: '#3B82F6'
        }
      })
    )
  )
  return created
}

async function handler(req, res) {
  try {
    const listId = req.params?.id || null
    const userId = req.user?.sub

    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // GET /api/user-task-lists - List all lists for the user (ensure defaults exist)
    if (req.method === 'GET' && !listId) {
      try {
        let lists = await prisma.userTaskList.findMany({
          where: { ownerId: userId },
          orderBy: [{ order: 'asc' }, { id: 'asc' }]
        })
        if (lists.length === 0) {
          lists = await ensureDefaultLists(userId)
        }
        return ok(res, { lists })
      } catch (error) {
        console.error('Error fetching user task lists:', error)
        return serverError(res, 'Failed to fetch lists', error.message)
      }
    }

    // GET /api/user-task-lists/:id - Get single list
    if (req.method === 'GET' && listId) {
      try {
        const list = await prisma.userTaskList.findFirst({
          where: { id: listId, ownerId: userId }
        })
        if (!list) return notFound(res, 'List not found')
        return ok(res, { list })
      } catch (error) {
        console.error('Error fetching list:', error)
        return serverError(res, 'Failed to fetch list', error.message)
      }
    }

    // POST /api/user-task-lists - Create list
    if (req.method === 'POST' && !listId) {
      try {
        const payload = await parseJsonBody(req)
        const { name, color = '#3B82F6', status } = payload || {}

        if (!name || !String(name).trim()) {
          return badRequest(res, 'List name is required')
        }

        const maxOrder = await prisma.userTaskList.aggregate({
          where: { ownerId: userId },
          _max: { order: true }
        })
        const nextOrder = (maxOrder._max.order ?? -1) + 1

        const list = await prisma.userTaskList.create({
          data: {
            ownerId: userId,
            name: String(name).trim(),
            color: String(color || '#3B82F6'),
            order: nextOrder,
            status: status != null ? String(status) : null
          }
        })
        return created(res, { list })
      } catch (error) {
        console.error('Error creating list:', error)
        return serverError(res, 'Failed to create list', error.message)
      }
    }

    // DELETE /api/user-task-lists?all=true - Delete all lists for current user
    if (req.method === 'DELETE' && !listId) {
      try {
        const deleteAll = String(req.query?.all || '').toLowerCase() === 'true'
        if (!deleteAll) return badRequest(res, 'Missing all=true for bulk delete')

        await prisma.$transaction([
          prisma.userTask.updateMany({
            where: { ownerId: userId },
            data: { listId: null }
          }),
          prisma.userTaskList.deleteMany({
            where: { ownerId: userId }
          })
        ])

        return ok(res, { deletedAll: true })
      } catch (error) {
        console.error('Error deleting all lists:', error)
        return serverError(res, 'Failed to delete all lists', error.message)
      }
    }

    // PUT /api/user-task-lists/:id - Update list
    if ((req.method === 'PUT' || req.method === 'PATCH') && listId) {
      try {
        const existing = await prisma.userTaskList.findFirst({
          where: { id: listId, ownerId: userId }
        })
        if (!existing) return notFound(res, 'List not found')

        const payload = await parseJsonBody(req)
        const updateData = {}
        if (payload?.name !== undefined) updateData.name = String(payload.name).trim() || existing.name
        if (payload?.color !== undefined) updateData.color = String(payload.color)
        if (payload?.order !== undefined) {
          const parsedOrder = parseInt(payload.order, 10)
          if (Number.isNaN(parsedOrder)) return badRequest(res, 'Order must be a valid integer')
          updateData.order = parsedOrder
        }
        if (payload?.status !== undefined) updateData.status = payload.status == null ? null : String(payload.status)

        const list = await prisma.userTaskList.update({
          where: { id: listId },
          data: updateData
        })
        return ok(res, { list })
      } catch (error) {
        console.error('Error updating list:', error)
        return serverError(res, 'Failed to update list', error.message)
      }
    }

    // DELETE /api/user-task-lists/:id - Delete list and reassign tasks to first remaining list
    if (req.method === 'DELETE' && listId) {
      try {
        const existing = await prisma.userTaskList.findFirst({
          where: { id: listId, ownerId: userId }
        })
        if (!existing) return notFound(res, 'List not found')

        const otherLists = await prisma.userTaskList.findMany({
          where: { ownerId: userId, id: { not: listId } },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          take: 1
        })
        const fallbackListId = otherLists[0]?.id ?? null

        await prisma.$transaction([
          ...(fallbackListId
            ? [prisma.userTask.updateMany({ where: { ownerId: userId, listId }, data: { listId: fallbackListId } })]
            : []),
          prisma.userTaskList.delete({ where: { id: listId } })
        ])

        return ok(res, { deleted: true, id: listId })
      } catch (error) {
        console.error('Error deleting list:', error)
        return serverError(res, 'Failed to delete list', error.message)
      }
    }

    if (res.headersSent || res.writableEnded) return
    res.setHeader('Allow', 'GET,POST,PUT,PATCH,DELETE')
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
  } catch (error) {
    console.error('User task lists handler error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
