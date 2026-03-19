// GET /api/client-activity-logs — list client activity (e.g. note create/update/delete)
// Query: clientId (required), noteId (optional, filter to that note), limit (optional)

import { prisma } from './_lib/prisma.js'
import { ok, serverError, badRequest, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { authRequired } from './_lib/authRequired.js'

async function handler(req, res) {
  const { method } = req
  const { clientId, noteId, limit } = req.query

  try {
    if (method === 'GET') {
      if (!clientId) {
        return badRequest(res, 'Missing clientId parameter')
      }
      const where = { clientId: String(clientId) }
      if (noteId) {
        where.type = { in: ['note_created', 'note_updated', 'note_deleted'] }
      }
      let logs = await prisma.clientActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } }
        },
        take: parseInt(limit, 10) || 100
      })
      if (noteId) {
        const targetNoteId = String(noteId)
        logs = logs.filter((log) => {
          try {
            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {})
            return meta.noteId === targetNoteId
          } catch (_) {
            return false
          }
        })
      }
      return ok(res, { logs })
    }
    return badRequest(res, `Method ${method} not allowed`)
  } catch (error) {
    console.error('❌ Client Activity Log API error:', error)
    return serverError(res, 'Failed to process request', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
