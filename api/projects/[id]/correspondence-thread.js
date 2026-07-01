/**
 * GET /api/projects/:id/correspondence-thread?threadId=...
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import {
  assertProjectCorrespondenceEnabled,
  ensureCorrespondenceTables,
  parseCorrespondenceEntry,
  parseCorrespondenceThread
} from '../../_lib/projectCorrespondence.js'

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const threadId = (url.searchParams.get('threadId') || req.query?.threadId || '').trim()
  if (!threadId) return badRequest(res, 'threadId query parameter is required')

  try {
    await ensureCorrespondenceTables()
    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    const thread = await prisma.projectCorrespondenceThread.findFirst({
      where: { id: threadId, projectId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        entries: {
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          include: {
            author: { select: { id: true, name: true, email: true } }
          }
        }
      }
    })
    if (!thread) return notFound(res, 'Thread not found')

    return ok(res, {
      thread: {
        ...parseCorrespondenceThread(thread),
        entries: (thread.entries || []).map(parseCorrespondenceEntry)
      }
    })
  } catch (e) {
    console.error('GET correspondence-thread:', e)
    return serverError(res, 'Failed to load correspondence thread', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
