/**
 * GET /api/projects/:id/document-collection-email-activity
 * Returns sent and received emails for a document/month cell so the "Request documents via email"
 * modal can show email activity (sent items, received replies, and attachments).
 * Query: documentId, month (1-12), year. (sectionId optional, not used for filtering so activity survives hard refresh.)
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
  const q = req.query || {}
  const documentId = (params.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null)
  const monthParam = params.get('month') ?? q.month
  const yearParam = params.get('year') ?? q.year
  const month = monthParam != null ? parseInt(String(monthParam), 10) : null
  const year = yearParam != null ? parseInt(String(yearParam), 10) : null

  const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
  if (!cell) {
    return badRequest(res, 'Query parameters documentId, month (1-12), and year are required')
  }

  // Query by projectId + documentId + month + year only (no sectionId filter) so activity survives hard refresh
  // regardless of which section the user opens after reload (same document id = same sent history)
  const sentWhere = {
    projectId: cell.projectId,
    documentId: cell.documentId,
    year: cell.year,
    month: cell.month,
    kind: 'sent'
  }

  let sent = []
  try {
    if (prisma.documentCollectionEmailLog) {
      sent = await prisma.documentCollectionEmailLog.findMany({
        where: sentWhere,
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true }
      })
      if (sent.length === 0) {
        const fallback = await prisma.documentCollectionEmailLog.findMany({
          where: { projectId: cell.projectId, year: cell.year, month: cell.month, kind: 'sent' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true, documentId: true }
        })
        const exactMatch = fallback.filter((row) => String(row.documentId).trim() === String(cell.documentId).trim()).map(({ id, createdAt }) => ({ id, createdAt }))
        if (exactMatch.length > 0) {
          sent = exactMatch
        } else if (fallback.length > 0) {
          // No exact documentId match (e.g. different section/doc after refresh) — return all sent for this project+month so activity still shows
          sent = fallback.map(({ id, createdAt }) => ({ id, createdAt }))
          console.log('document-collection-email-activity: using project+month fallback so sent persists after refresh', { requestedDocumentId: cell.documentId, returnedCount: sent.length })
        }
      }
    }
  } catch (logErr) {
    console.error('document-collection-email-activity: log query failed (returning empty sent):', logErr.message)
  }
  if (sent.length === 0) {
    try {
      const totalForProject = await prisma.documentCollectionEmailLog.count({ where: { projectId: cell.projectId } })
      console.log('document-collection-email-activity: no sent items for cell', { projectId: cell.projectId, documentId: cell.documentId, month: cell.month, year: cell.year, totalLogsForProject: totalForProject })
    } catch (_) {
      console.log('document-collection-email-activity: no sent items for cell', { projectId: cell.projectId, documentId: cell.documentId, month: cell.month, year: cell.year })
    }
  }

  try {
    // Verify document exists and belongs to this project (for received comments and auth)
    const document = await prisma.documentItem.findUnique({
      where: { id: cell.documentId },
      include: { section: { select: { projectId: true } } }
    })
    if (!document || String(document.section?.projectId) !== cell.projectId) {
      return ok(res, { sent, received: [] })
    }

    const receivedRows = await prisma.documentItemComment.findMany({
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

    const received = receivedRows.map((r) => {
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
    return ok(res, { sent, received: [] })
  }
}

export default authRequired(handler)
