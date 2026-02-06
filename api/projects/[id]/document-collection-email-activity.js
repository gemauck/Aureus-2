/**
 * GET /api/projects/:id/document-collection-email-activity
 * Returns sent and received emails for a document/month cell.
 * DELETE: body or query id + type (sent|received) to remove one item.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { parseJsonBody } from '../../_lib/body.js'
import { normalizeDocumentCollectionCell, normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function parseCcFromText(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\r?\n/)
  const ccLine = lines.find((l) => l.trim().toLowerCase().startsWith('cc:'))
  if (!ccLine) return []
  const raw = ccLine.split(':').slice(1).join(':').trim()
  if (!raw) return []
  const parts = raw.split(/[;,]+/).map((p) => p.trim()).filter(Boolean)
  const emails = []
  for (const p of parts) {
    const match = p.match(/<([^>]+)>/)
    const email = (match && match[1] ? match[1] : p).trim()
    if (EMAIL_RE.test(email)) emails.push(email)
  }
  return [...new Set(emails)]
}

function buildSentSelect({ includeMessageId = true } = {}) {
  const select = {
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
  if (!includeMessageId) {
    delete select.messageId
  }
  return select
}

async function handler(req, res) {
  const projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  if (req.method === 'DELETE') {
    try {
      const body = await parseJsonBody(req).catch(() => ({})) || {}
      const q = req.query || {}
      const clear = (body.clear ?? q.clear) != null ? String(body.clear ?? q.clear).trim().toLowerCase() : ''
      if (clear === 'sent') {
        const documentId = (body.documentId ?? q.documentId) != null ? String(body.documentId ?? q.documentId).trim() : null
        const monthParam = body.month ?? q.month
        const yearParam = body.year ?? q.year
        const month = monthParam != null ? parseInt(String(monthParam), 10) : null
        const year = yearParam != null ? parseInt(String(yearParam), 10) : null
        const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
        if (!cell) {
          return badRequest(res, 'documentId, month (1-12), and year are required to clear sent activity')
        }
        const [sentLogs, replyComments] = await Promise.all([
          prisma.documentCollectionEmailLog.deleteMany({
            where: {
              projectId: cell.projectId,
              documentId: cell.documentId,
              year: cell.year,
              month: cell.month,
              kind: 'sent'
            }
          }),
          prisma.documentItemComment.deleteMany({
            where: {
              itemId: cell.documentId,
              year: cell.year,
              month: cell.month,
              author: 'Sent reply (platform)'
            }
          })
        ])
        return ok(res, { cleared: true, sentDeleted: sentLogs.count || 0, replyDeleted: replyComments.count || 0 })
      }
      const id = (body.id ?? q.id) != null ? String(body.id ?? q.id).trim() : null
      const type = (body.type ?? q.type) === 'received' ? 'received' : (body.type ?? q.type) === 'sent' ? 'sent' : null
      if (!id || !type) {
        return badRequest(res, 'Query or body must include id and type (sent or received)')
      }
      if (type === 'sent') {
        const log = await prisma.documentCollectionEmailLog.findFirst({
          where: { id, projectId, kind: 'sent' }
        })
        if (log) {
          await prisma.documentCollectionEmailLog.delete({ where: { id } })
          return ok(res, { deleted: true, type: 'sent', id })
        }
        // Fallback: sent replies are stored as DocumentItemComment (author: Sent reply (platform))
        const replyComment = await prisma.documentItemComment.findUnique({
          where: { id },
          include: { item: { select: { section: { select: { projectId: true } } } } }
        })
        if (!replyComment || String(replyComment.item?.section?.projectId) !== projectId) {
          return badRequest(res, 'Sent log not found or access denied')
        }
        if ((replyComment.author || '').trim() !== 'Sent reply (platform)') {
          return badRequest(res, 'Sent log not found or access denied')
        }
        await prisma.documentItemComment.delete({ where: { id } })
        return ok(res, { deleted: true, type: 'sent', id })
      }
      // type === 'received': DocumentItemComment
      const comment = await prisma.documentItemComment.findUnique({
        where: { id },
        include: { item: { select: { section: { select: { projectId: true } } } } }
      })
      if (!comment || String(comment.item?.section?.projectId) !== projectId) {
        return badRequest(res, 'Received comment not found or access denied')
      }
      await prisma.documentItemComment.delete({ where: { id } })
      return ok(res, { deleted: true, type: 'received', id })
    } catch (e) {
      if (e.code === 'P2025') {
        return badRequest(res, 'Record not found')
      }
      console.error('DELETE document-collection-email-activity error:', e)
      return serverError(res, e.message || 'Delete failed')
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET, DELETE').json({ error: 'Method not allowed' })
  }

  const fullUrl = req.originalUrl || req.url || ''
  const query = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const q = req.query || {}
  const documentId = (params.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null)
  const documentName = (params.get('documentName')?.trim() || (q.documentName != null ? String(q.documentName).trim() : null) || null)
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
      let includeMessageId = true
      try {
        sent = await prisma.documentCollectionEmailLog.findMany({
          where: sentWhere,
          orderBy: { createdAt: 'asc' },
          select: buildSentSelect({ includeMessageId })
        })
      } catch (logErr) {
        const msg = String(logErr?.message || '')
        if (msg.includes('Unknown field `messageId`')) {
          includeMessageId = false
          try {
            sent = await prisma.documentCollectionEmailLog.findMany({
              where: sentWhere,
              orderBy: { createdAt: 'asc' },
              select: buildSentSelect({ includeMessageId: false })
            })
          } catch (retryErr) {
            console.error('document-collection-email-activity: log query failed (returning empty sent):', retryErr.message)
          }
        } else {
          console.error('document-collection-email-activity: log query failed (returning empty sent):', logErr.message)
        }
      }
      if (sent.length === 0) {
        const fallbackSelect = {
          documentId: true,
          ...buildSentSelect({ includeMessageId })
        }
        let fallback = []
        try {
          fallback = await prisma.documentCollectionEmailLog.findMany({
            where: { projectId: cell.projectId, year: cell.year, month: cell.month, kind: 'sent' },
            orderBy: { createdAt: 'asc' },
            select: fallbackSelect
          })
        } catch (fallbackErr) {
          const msg = String(fallbackErr?.message || '')
          if (msg.includes('Unknown field `messageId`')) {
            const fallbackSelectNoMessageId = {
              documentId: true,
              ...buildSentSelect({ includeMessageId: false })
            }
            fallback = await prisma.documentCollectionEmailLog.findMany({
              where: { projectId: cell.projectId, year: cell.year, month: cell.month, kind: 'sent' },
              orderBy: { createdAt: 'asc' },
              select: fallbackSelectNoMessageId
            })
          } else {
            throw fallbackErr
          }
        }
        const exactMatch = fallback
          .filter((row) => String(row.documentId).trim() === String(cell.documentId).trim())
          .map(({ id, createdAt, subject, bodyText, messageId, deliveryStatus, deliveredAt, bouncedAt, bounceReason, lastEventAt }) => ({
            id,
            createdAt,
            subject,
            bodyText,
            messageId,
            deliveryStatus,
            deliveredAt,
            bouncedAt,
            bounceReason,
            lastEventAt
          }))
        if (exactMatch.length > 0) {
          sent = exactMatch
        } else if (fallback.length > 0) {
          // Fallback: attempt to match by document name in subject/body (legacy ID mismatch after refresh).
          const name = (documentName || '').trim().toLowerCase()
          if (name) {
            const matched = fallback.filter((row) => {
              const subject = (row.subject || '').toLowerCase()
              const body = (row.bodyText || '').toLowerCase()
              return subject.includes(name) || body.includes(name)
            }).map(({ id, createdAt, subject, bodyText, messageId, deliveryStatus, deliveredAt, bouncedAt, bounceReason, lastEventAt }) => ({
              id,
              createdAt,
              subject,
              bodyText,
              messageId,
              deliveryStatus,
              deliveredAt,
              bouncedAt,
              bounceReason,
              lastEventAt
            }))
            if (matched.length > 0) {
              sent = matched
            } else {
              console.log('document-collection-email-activity: no sent match for documentId or documentName; returning empty', {
                requestedDocumentId: cell.documentId,
                candidateCount: fallback.length
              })
            }
          } else {
            console.log('document-collection-email-activity: no sent match for documentId; returning empty', {
              requestedDocumentId: cell.documentId,
              candidateCount: fallback.length
            })
          }
        }
      }
    }
  } catch (logErr) {
    console.error('document-collection-email-activity: log query failed (returning empty sent):', logErr.message)
  }

  // Include fallback "sent reply" comments (when DocumentCollectionEmailLog create failed)
  try {
    const replyComments = await prisma.documentItemComment.findMany({
      where: {
        itemId: cell.documentId,
        year: cell.year,
        month: cell.month,
        author: 'Sent reply (platform)'
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, text: true, createdAt: true }
    })
    for (const c of replyComments) {
      const firstLine = (c.text || '').split('\n')[0] || ''
      const subject = firstLine.startsWith('Subject: ') ? firstLine.slice(9).trim() : firstLine.trim()
      const bodyText = (c.text || '').includes('\n\n') ? (c.text || '').split('\n\n').slice(1).join('\n\n').trim() : ''
      sent.push({ id: c.id, createdAt: c.createdAt, subject: subject.slice(0, 1000), bodyText: bodyText.slice(0, 50000) })
    }
    if (replyComments.length > 0) sent.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  } catch (_) {}

  // Deduplicate sent: same subject + createdAt within 10s → keep first (avoids 3x same send in UI). Never dedupe replies (Re:) so all replies show.
  if (sent.length > 1) {
    const deduped = []
    for (const s of sent) {
      const subj = (s.subject || '').trim()
      const isReply = subj.toLowerCase().startsWith('re:')
      if (isReply) {
        deduped.push(s)
        continue
      }
      const t = s.createdAt ? new Date(s.createdAt).getTime() : 0
      let skip = false
      for (const other of deduped) {
        const ot = other.createdAt ? new Date(other.createdAt).getTime() : 0
        if (Math.abs(t - ot) <= 10000 && (s.subject || '') === (other.subject || '')) {
          skip = true
          break
        }
      }
      if (!skip) deduped.push(s)
    }
    sent = deduped
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

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const received = receivedRows.map((r) => {
      let attachments = []
      if (r.attachments) {
        try {
          attachments = typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (Array.isArray(r.attachments) ? r.attachments : [])
        } catch (_) {
          attachments = []
        }
      }
      // Parse reply-to email from stored text: "Email from Client (sender@example.com)"
      let replyToEmail = null
      const text = (r.text || '').trim()
      const match = text.match(/^Email from Client\s*\(([^)]+)\)/)
      if (match && match[1]) {
        const addr = match[1].trim()
        if (emailRe.test(addr)) replyToEmail = addr
      }
      const cc = parseCcFromText(text)
      return {
        id: r.id,
        text: r.text,
        attachments,
        createdAt: r.createdAt,
        replyToEmail,
        cc
      }
    })

    return ok(res, { sent, received })
  } catch (e) {
    console.error('GET document-collection-email-activity error:', e)
    return ok(res, { sent, received: [] })
  }
}

export default authRequired(handler)
