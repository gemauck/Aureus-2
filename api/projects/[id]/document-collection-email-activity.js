/**
 * GET /api/projects/:id/document-collection-email-activity
 * Returns sent and received emails for a document/month cell so the "Request documents via email"
 * modal can show email activity (sent items, received replies, and attachments).
 * Query: sectionId, documentId, month (1-12), year.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const pathOrUrl = (req.originalUrl || req.url || req.path || '').split('?')[0].split('#')[0]
  const match = pathOrUrl.match(/(?:\/api)?\/projects\/([^/]+)\/document-collection-email-activity/)
  const rawId = (req.params && req.params.id) || (match ? match[1] : null)
  const projectId = rawId ? String(rawId).trim() : null
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

  if (!documentId || month == null || isNaN(month) || month < 1 || month > 12 || year == null || isNaN(year)) {
    return badRequest(res, 'Query parameters documentId, month (1-12), and year are required')
  }

  const pid = String(projectId).trim()
  const docId = String(documentId).trim()
  const yearNum = Number(year)
  const monthNum = Number(month)

  try {
    // Verify document exists and belongs to this project (via its section)
    const document = await prisma.documentItem.findUnique({
      where: { id: docId },
      include: { section: { select: { projectId: true } } }
    })
    if (!document || String(document.section?.projectId) !== pid) {
      return ok(res, { sent: [], received: [] })
    }

    // Query sent by projectId + documentId + year + month (exact match). Fallback: same project/year/month, filter by documentId in code.
    let sent = await prisma.documentRequestEmailSent.findMany({
      where: { projectId: pid, documentId: docId, year: yearNum, month: monthNum },
      orderBy: { createdAt: 'asc' },
      select: { id: true, messageId: true, createdAt: true }
    })
    if (sent.length === 0) {
      const fallback = await prisma.documentRequestEmailSent.findMany({
        where: { projectId: pid, year: yearNum, month: monthNum },
        orderBy: { createdAt: 'asc' },
        select: { id: true, messageId: true, createdAt: true, documentId: true }
      })
      sent = fallback.filter((s) => String(s.documentId || '').trim() === docId).map(({ id, messageId, createdAt }) => ({ id, messageId, createdAt }))
    }

    const [receivedRows] = await Promise.all([
      prisma.documentItemComment.findMany({
        where: {
          itemId: docId,
          year: yearNum,
          month: monthNum,
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
