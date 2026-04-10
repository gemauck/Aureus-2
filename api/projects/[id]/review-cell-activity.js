/**
 * GET /api/projects/:id/review-cell-activity
 * ProjectActivityLog rows for one tracker cell (monthly data review, compliance review, weekly FMS, monthly FMS).
 */
import { authRequired } from '../../_lib/authRequired.js'
import { normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { badRequest, ok } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

const TRACKERS = new Set(['monthly_data_review', 'compliance_review', 'weekly_fms', 'monthly_fms'])

function withGetSafe(fn) {
  const empty = JSON.stringify({ data: { timeline: [] } })
  return function (req, res) {
    if (req.method !== 'GET') return fn(req, res)
    const sendEmpty = () => {
      if (res.headersSent || res.writableEnded) return
      try {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(empty)
      } catch (_) {}
    }
    let p
    try {
      p = fn(req, res)
    } catch (e) {
      console.error('review-cell-activity GET safe wrapper (sync):', e?.message || e)
      sendEmpty()
      return
    }
    if (p == null || typeof p.then !== 'function') {
      if (!res.headersSent && !res.writableEnded) sendEmpty()
      return
    }
    return p
      .then(() => {
        if (!res.headersSent && !res.writableEnded) sendEmpty()
      })
      .catch((e) => {
        console.error('review-cell-activity GET safe wrapper:', e?.message || e)
        sendEmpty()
      })
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  const projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  const q = req.query || {}
  const tracker = String(q.tracker || '').trim()
  if (!TRACKERS.has(tracker)) {
    return badRequest(res, 'Invalid or missing tracker')
  }

  const documentId = q.documentId != null ? String(q.documentId).trim() : ''
  const year = q.year != null ? parseInt(String(q.year), 10) : NaN
  if (!documentId || Number.isNaN(year)) {
    return badRequest(res, 'documentId and year are required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  })
  if (!project) {
    return ok(res, { timeline: [] })
  }

  let rows = []
  try {
    if (tracker === 'monthly_data_review') {
      const month = q.month != null ? parseInt(String(q.month), 10) : NaN
      if (Number.isNaN(month) || month < 1 || month > 12) {
        return badRequest(res, 'month (1-12) is required for monthly_data_review')
      }
      rows = await prisma.$queryRaw`
        SELECT id, type, description, "userName", "userId", "createdAt"
        FROM "ProjectActivityLog"
        WHERE "projectId" = ${projectId}
          AND type IN ('monthly_data_review_status_change', 'monthly_data_review_notes_change')
          AND metadata IS NOT NULL
          AND metadata <> ''
          AND (metadata::jsonb->>'entityType') = 'monthly_data_review'
          AND (metadata::jsonb->>'entityId') = ${documentId}
          AND (metadata::jsonb->>'year')::int = ${year}
          AND (metadata::jsonb->>'month')::int = ${month}
        ORDER BY "createdAt" ASC
      `
    } else if (tracker === 'compliance_review') {
      const month = q.month != null ? parseInt(String(q.month), 10) : NaN
      if (Number.isNaN(month) || month < 1 || month > 12) {
        return badRequest(res, 'month (1-12) is required for compliance_review')
      }
      rows = await prisma.$queryRaw`
        SELECT id, type, description, "userName", "userId", "createdAt"
        FROM "ProjectActivityLog"
        WHERE "projectId" = ${projectId}
          AND type IN ('compliance_review_status_change', 'compliance_review_notes_change')
          AND metadata IS NOT NULL
          AND metadata <> ''
          AND (metadata::jsonb->>'entityType') = 'compliance_review'
          AND (metadata::jsonb->>'entityId') = ${documentId}
          AND (metadata::jsonb->>'year')::int = ${year}
          AND (metadata::jsonb->>'month')::int = ${month}
        ORDER BY "createdAt" ASC
      `
    } else if (tracker === 'monthly_fms') {
      const month = q.month != null ? parseInt(String(q.month), 10) : NaN
      if (Number.isNaN(month) || month < 1 || month > 12) {
        return badRequest(res, 'month (1-12) is required for monthly_fms')
      }
      rows = await prisma.$queryRaw`
        SELECT id, type, description, "userName", "userId", "createdAt"
        FROM "ProjectActivityLog"
        WHERE "projectId" = ${projectId}
          AND type = 'monthly_fms_status_change'
          AND metadata IS NOT NULL
          AND metadata <> ''
          AND (metadata::jsonb->>'entityType') = 'monthly_fms'
          AND (metadata::jsonb->>'entityId') = ${documentId}
          AND (metadata::jsonb->>'year')::int = ${year}
          AND (metadata::jsonb->>'month')::int = ${month}
        ORDER BY "createdAt" ASC
      `
    } else if (tracker === 'weekly_fms') {
      const statusKey = q.statusKey != null ? String(q.statusKey).trim() : ''
      if (!statusKey) {
        return badRequest(res, 'statusKey is required for weekly_fms')
      }
      rows = await prisma.$queryRaw`
        SELECT id, type, description, "userName", "userId", "createdAt"
        FROM "ProjectActivityLog"
        WHERE "projectId" = ${projectId}
          AND type = 'weekly_fms_status_change'
          AND metadata IS NOT NULL
          AND metadata <> ''
          AND (metadata::jsonb->>'entityType') = 'weekly_fms'
          AND (metadata::jsonb->>'entityId') = ${documentId}
          AND (metadata::jsonb->>'year')::int = ${year}
          AND (metadata::jsonb->>'statusKey') = ${statusKey}
        ORDER BY "createdAt" ASC
      `
    }
  } catch (e) {
    console.error('review-cell-activity: query failed:', e?.message || e)
    rows = []
  }

  const list = Array.isArray(rows) ? rows : []
  const timeline = list.map((a) => ({
    id: `activity-${a.id}`,
    kind: 'activity',
    activityId: a.id,
    activityType: a.type,
    description: a.description,
    userName: a.userName,
    userId: a.userId,
    createdAt: a.createdAt
  }))

  return ok(res, { timeline })
}

export default withGetSafe(authRequired(handler))
