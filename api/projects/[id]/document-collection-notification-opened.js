/**
 * POST /api/projects/:id/document-collection-notification-opened
 * Body: { documentId, year, month, type }
 * Persists per-user read/open state for notification badges.
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

  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) {
    return badRequest(res, 'User not found')
  }

  const body = req.body || {}
  const documentId = body.documentId
  const year = body.year != null ? parseInt(String(body.year), 10) : null
  const month = body.month != null ? parseInt(String(body.month), 10) : null
  const type = String(body.type || '').trim()

  if (!documentId || year == null || isNaN(year) || month == null || isNaN(month) || !type) {
    return badRequest(res, 'documentId, year, month, and type are required')
  }
  if (!['email', 'comment'].includes(type)) {
    return badRequest(res, 'type must be email or comment')
  }

  try {
    if (!prisma.documentCollectionNotificationRead) {
      return ok(res, { success: false, skipped: true, reason: 'notifications_table_unavailable' })
    }
    const now = new Date()
    await prisma.documentCollectionNotificationRead.upsert({
      where: {
        userId_projectId_documentId_year_month_type: {
          userId: String(userId),
          projectId: String(projectId),
          documentId: String(documentId),
          year,
          month,
          type
        }
      },
      update: { openedAt: now },
      create: {
        userId: String(userId),
        projectId: String(projectId),
        documentId: String(documentId),
        year,
        month,
        type,
        openedAt: now
      }
    })

    return ok(res, { success: true })
  } catch (e) {
    console.error('POST document-collection-notification-opened error:', e)
    if (e?.code === 'P2021' || /notificationread|does not exist/i.test(String(e?.message || ''))) {
      return ok(res, { success: false, skipped: true, reason: 'notifications_table_unavailable' })
    }
    return serverError(res, e.message || 'Failed to mark notification opened')
  }
}

export default authRequired(handler)
