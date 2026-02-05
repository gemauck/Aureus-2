/**
 * GET /api/projects/:id/document-collection-received-counts?year=YYYY
 * Returns received email counts per document/month for the project and year.
 * Used to show notification badges on the "Request documents via email" cells.
 * Only received (inbound) emails are counted; sent counts are not included.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  const projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const fullUrl = req.originalUrl || req.url || ''
  const query = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const q = req.query || {}
  const yearParam = params.get('year') ?? q.year
  const year = yearParam != null ? parseInt(String(yearParam), 10) : null

  if (year == null || isNaN(year)) {
    return badRequest(res, 'Query parameter year is required')
  }

  try {
    const userId = req.user?.sub || req.user?.id
    const rows = await prisma.documentItemComment.groupBy({
      by: ['itemId', 'month'],
      where: {
        year,
        item: { section: { projectId } },
        OR: [
          { author: 'Email from Client' },
          { text: { startsWith: 'Email from Client' } }
        ]
      },
      _count: { id: true },
      _max: { createdAt: true }
    })

    const counts = rows.map((r) => ({
      documentId: r.itemId,
      month: r.month,
      receivedCount: r._count.id,
      latestReceivedAt: r._max?.createdAt || null
    }))

    let opened = []
    if (userId) {
      opened = await prisma.documentCollectionNotificationRead.findMany({
        where: {
          userId: String(userId),
          projectId: String(projectId),
          year
        },
        select: {
          documentId: true,
          month: true,
          type: true,
          openedAt: true
        }
      })
    }

    return ok(res, { counts, opened })
  } catch (e) {
    console.error('GET document-collection-received-counts error:', e)
    return serverError(res, e.message || 'Failed to load counts')
  }
}

export default authRequired(handler)
