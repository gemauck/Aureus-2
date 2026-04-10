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

const DOCUMENT_SECTION_TIMELINE_TYPES = new Set([
  'document_section_status_change',
  'document_section_notes_change',
  'document_section_email_request_change'
])

function parseActivityMetadata(log) {
  try {
    const raw = log?.metadata
    if (typeof raw === 'string') return JSON.parse(raw || '{}')
    if (raw && typeof raw === 'object') return raw
  } catch (_) {}
  return {}
}

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

  let comments = []
  let sentLogs = []
  let activityLogs = []

  try {
    comments = await prisma.documentItemComment.findMany({
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
    })
  } catch (e) {
    console.error('document-collection-cell-activity: comments query failed:', e?.message || e)
  }

  try {
    if (prisma.documentCollectionEmailLog) {
      sentLogs = await prisma.documentCollectionEmailLog.findMany({
        where: {
          projectId: cell.projectId,
          documentId: cell.documentId,
          year: cell.year,
          month: cell.month,
          kind: 'sent'
        },
        orderBy: { createdAt: 'asc' },
        select: {
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
      })
    }
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg.includes('Unknown field')) {
      try {
        sentLogs = await prisma.documentCollectionEmailLog.findMany({
          where: {
            projectId: cell.projectId,
            documentId: cell.documentId,
            year: cell.year,
            month: cell.month,
            kind: 'sent'
          },
          orderBy: { createdAt: 'asc' },
          select: {
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
        })
      } catch (e2) {
        console.error('document-collection-cell-activity: sent logs query failed:', e2?.message || e2)
      }
    } else {
      console.error('document-collection-cell-activity: sent logs query failed:', e?.message || e)
    }
  }

  try {
    activityLogs = await prisma.projectActivityLog.findMany({
      where: { projectId: cell.projectId },
      orderBy: { createdAt: 'desc' },
      take: 800,
      select: {
        id: true,
        type: true,
        description: true,
        userName: true,
        userId: true,
        metadata: true,
        createdAt: true
      }
    })
  } catch (e) {
    console.error('document-collection-cell-activity: activity log query failed:', e?.message || e)
  }

  const filteredActivity = activityLogs.filter((log) => {
    if (!DOCUMENT_SECTION_TIMELINE_TYPES.has(String(log.type || ''))) return false
    const meta = parseActivityMetadata(log)
    if (String(meta.entityType || '') !== 'document_section') return false
    if (String(meta.entityId || '') !== String(cell.documentId)) return false
    const y = Number(meta.year)
    const m = Number(meta.month)
    if (y !== cell.year || m !== cell.month) return false
    return true
  })

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
