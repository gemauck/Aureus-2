/**
 * GET /api/projects/:id/document-collection-cell-activity
 * Unified chronological activity for one document-collection month cell:
 * comments, sent email logs, and ProjectActivityLog rows (status, notes, email template).
 */
import { authRequired } from '../../_lib/authRequired.js'
import { normalizeDocumentCollectionCell, normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { badRequest, ok } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

const SYNTHETIC_SENT_AUTHORS = new Set(['Sent reply (platform)', 'Sent request (platform)'])

function parseSyntheticSubjectBody(text) {
  const firstLine = (text || '').split('\n')[0] || ''
  const subject = firstLine.startsWith('Subject: ') ? firstLine.slice(9).trim() : firstLine.trim()
  const bodyText = (text || '').includes('\n\n')
    ? (text || '').split('\n\n').slice(1).join('\n\n').trim()
    : ''
  return { subject, bodyText }
}

function syntheticCommentMatchesLog(comment, sentLogs) {
  const author = (comment.author || '').trim()
  if (!SYNTHETIC_SENT_AUTHORS.has(author)) return false
  const { subject } = parseSyntheticSubjectBody(comment.text)
  const ct = new Date(comment.createdAt).getTime()
  for (const log of sentLogs) {
    const lt = new Date(log.createdAt).getTime()
    if (Number.isNaN(ct) || Number.isNaN(lt) || Math.abs(ct - lt) > 120000) continue
    const ls = (log.subject || '').trim()
    if (ls === subject || (!ls && !subject)) return true
  }
  return false
}

function parseCommentAttachments(raw) {
  if (!raw) return []
  try {
    const a = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return Array.isArray(a) ? a : []
  } catch (_) {
    return []
  }
}

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
      console.error('document-collection-cell-activity GET safe wrapper (sync):', e?.message || e)
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
        console.error('document-collection-cell-activity GET safe wrapper:', e?.message || e)
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

  const fullUrl = req.originalUrl || req.url || ''
  const query = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const q = req.query || {}
  const documentId =
    params.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null
  const monthParam = params.get('month') ?? q.month
  const yearParam = params.get('year') ?? q.year
  const month = monthParam != null ? parseInt(String(monthParam), 10) : null
  const year = yearParam != null ? parseInt(String(yearParam), 10) : null

  const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
  if (!cell) {
    return badRequest(res, 'Query parameters documentId, month (1-12), and year are required')
  }

  const document = await prisma.documentItem.findUnique({
    where: { id: cell.documentId },
    include: { section: { select: { projectId: true } } }
  })
  if (!document || String(document.section?.projectId) !== cell.projectId) {
    return ok(res, { timeline: [] })
  }

  const sentLogSelectFull = {
    id: true,
    createdAt: true,
    subject: true,
    bodyText: true,
    messageId: true,
    deliveryStatus: true,
    deliveredAt: true,
    bouncedAt: true,
    bounceReason: true,
    lastEventAt: true
  }
  const sentLogSelectFallback = {
    id: true,
    createdAt: true,
    subject: true,
    bodyText: true,
    deliveryStatus: true,
    deliveredAt: true,
    bouncedAt: true,
    bounceReason: true,
    lastEventAt: true
  }
  const sentWhere = {
    projectId: cell.projectId,
    documentId: cell.documentId,
    year: cell.year,
    month: cell.month,
    kind: 'sent'
  }

  const fetchSentLogs = async () => {
    if (!prisma.documentCollectionEmailLog) return []
    try {
      return await prisma.documentCollectionEmailLog.findMany({
        where: sentWhere,
        orderBy: { createdAt: 'asc' },
        select: sentLogSelectFull
      })
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg.includes('Unknown field')) {
        try {
          return await prisma.documentCollectionEmailLog.findMany({
            where: sentWhere,
            orderBy: { createdAt: 'asc' },
            select: sentLogSelectFallback
          })
        } catch (e2) {
          console.error('document-collection-cell-activity: sent logs query failed:', e2?.message || e2)
          return []
        }
      }
      console.error('document-collection-cell-activity: sent logs query failed:', e?.message || e)
      return []
    }
  }

  /** Postgres: filter by JSON metadata in SQL — avoids loading hundreds of unrelated project rows per cell. */
  const fetchActivityLogsForCell = async () => {
    try {
      const rows = await prisma.$queryRaw`
        SELECT id, type, description, "userName", "userId", metadata, "createdAt"
        FROM "ProjectActivityLog"
        WHERE "projectId" = ${cell.projectId}
          AND type IN (
            'document_section_status_change',
            'document_section_notes_change',
            'document_section_email_request_change'
          )
          AND metadata IS NOT NULL
          AND metadata <> ''
          AND (metadata::jsonb->>'entityType') = 'document_section'
          AND (metadata::jsonb->>'entityId') = ${String(cell.documentId)}
          AND (metadata::jsonb->>'year') IS NOT NULL
          AND (metadata::jsonb->>'month') IS NOT NULL
          AND (metadata::jsonb->>'year')::int = ${cell.year}
          AND (metadata::jsonb->>'month')::int = ${cell.month}
        ORDER BY "createdAt" ASC
      `
      return Array.isArray(rows) ? rows : []
    } catch (e) {
      console.error('document-collection-cell-activity: activity SQL query failed:', e?.message || e)
      return []
    }
  }

  let comments = []
  let sentLogs = []
  let activityLogs = []

  try {
    ;[comments, sentLogs, activityLogs] = await Promise.all([
      prisma.documentItemComment.findMany({
        where: {
          itemId: cell.documentId,
          year: cell.year,
          month: cell.month
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          text: true,
          author: true,
          authorId: true,
          attachments: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      fetchSentLogs(),
      fetchActivityLogsForCell()
    ])
  } catch (e) {
    console.error('document-collection-cell-activity: parallel fetch failed:', e?.message || e)
  }

  const filteredActivity = activityLogs

  const timeline = []

  for (const c of comments) {
    if (syntheticCommentMatchesLog(c, sentLogs)) continue
    timeline.push({
      id: `comment-${c.id}`,
      kind: 'comment',
      commentId: c.id,
      text: c.text,
      author: c.author,
      authorId: c.authorId,
      attachments: parseCommentAttachments(c.attachments),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })
  }

  for (const s of sentLogs) {
    timeline.push({
      id: `email_sent-${s.id}`,
      kind: 'email_sent',
      logId: s.id,
      subject: s.subject,
      bodyText: s.bodyText,
      messageId: s.messageId,
      deliveryStatus: s.deliveryStatus,
      deliveredAt: s.deliveredAt,
      bouncedAt: s.bouncedAt,
      bounceReason: s.bounceReason,
      lastEventAt: s.lastEventAt,
      createdAt: s.createdAt
    })
  }

  for (const a of filteredActivity) {
    timeline.push({
      id: `activity-${a.id}`,
      kind: 'activity',
      activityId: a.id,
      activityType: a.type,
      description: a.description,
      userName: a.userName,
      userId: a.userId,
      createdAt: a.createdAt
    })
  }

  timeline.sort((x, y) => {
    const tx = new Date(x.createdAt).getTime()
    const ty = new Date(y.createdAt).getTime()
    return tx - ty
  })

  return ok(res, { timeline })
}

export default withGetSafe(authRequired(handler))
