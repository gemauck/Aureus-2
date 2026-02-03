/**
 * GET /api/projects/:id/document-collection-email-activity
 * Returns sent and received emails for a document/month cell so the "Request documents via email"
 * modal can show email activity (sent items, received replies, and attachments).
 * Query: sectionId, documentId, month (1-12), year.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { normalizeDocumentCollectionCell, normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  const fullUrl = req.originalUrl || req.url || ''
  const query = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const documentId = params.get('documentId')?.trim() || null
  const monthParam = params.get('month')
  const yearParam = params.get('year')
  const month = monthParam != null ? parseInt(String(monthParam), 10) : null
  const year = yearParam != null ? parseInt(String(yearParam), 10) : null

  const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
  if (!cell) {
    return badRequest(res, 'Query parameters documentId, month (1-12), and year are required')
  }

  try {
    // Verify document exists and belongs to this project (via its section)
    const document = await prisma.documentItem.findUnique({
      where: { id: cell.documentId },
      include: { section: { select: { projectId: true } } }
    })
    if (!document || String(document.section?.projectId) !== cell.projectId) {
      return ok(res, { sent: [], received: [] })
    }

    // Sent items from dedicated log (same keys as send API writes)
    const sent = await prisma.documentCollectionEmailLog.findMany({
      where: { projectId: cell.projectId, documentId: cell.documentId, year: cell.year, month: cell.month, kind: 'sent' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true }
    })

    const [receivedRows] = await Promise.all([
      prisma.documentItemComment.findMany({
        where: {
          itemId: cell.documentId,
          year: cell.year,
          month: cell.month,
          OR: [
            { author: 'Email from Client' },
            { text: { startsWith: 'Email from Client' } }
          ]
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, text: true, attachments: true, createdAt: true }
      })
    ])

    let received = receivedRows.map((r) => {
      let attachments = []
      if (r.attachments) {
        try {
          attachments = typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (Array.isArray(r.attachments) ? r.attachments : [])
        } catch (_) {
          attachments = []
        }
      }
      return {
        id: r.id,
        text: r.text,
        attachments,
        createdAt: r.createdAt
      }
    })

    return ok(res, { sent, received })
  } catch (e) {
    console.error('GET document-collection-email-activity error:', e)
    return serverError(res, e.message || 'Failed to load email activity')
  }
}

export default authRequired(handler)
