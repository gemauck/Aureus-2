/**
 * POST /api/projects/:id/document-collection-send-email
 * Send document request emails to contacts. Used by Document Collection checklist
 * "Request documents" flow. Uses existing mail infrastructure (Resend/SendGrid/SMTP).
 * Optional body: sectionId, documentId, month, year — when provided, Reply-To is set
 * to the inbound address and a custom Message-ID is set so reply In-Reply-To matches.
 */
import crypto from 'crypto'
import { authRequired } from '../../_lib/authRequired.js'
import { parseJsonBody } from '../../_lib/body.js'
import { normalizeDocumentCollectionCell, normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { sendEmail } from '../../_lib/email.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(s) {
  return typeof s === 'string' && s.trim().length > 0 && EMAIL_RE.test(s.trim())
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  let projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })

  try {
    const body = await parseJsonBody(req).catch(() => ({})) || {}
    if (!projectId && body.projectId != null) {
      projectId = String(body.projectId).trim() || null
    }
    if (!projectId) {
      return badRequest(res, 'Project ID required')
    }
    const fullUrl = req.originalUrl || req.url || ''
    const queryString = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
    const query = new URLSearchParams(queryString)
    const q = req.query || {}
    const to = Array.isArray(body.to) ? body.to : (typeof body.to === 'string' ? [body.to] : [])
    const cc = Array.isArray(body.cc) ? body.cc : (typeof body.cc === 'string' ? [body.cc] : [])
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    let html = typeof body.html === 'string' ? body.html.trim() : ''
    let text = typeof body.text === 'string' ? body.text.trim() : undefined
    const sectionId = body.sectionId != null ? String(body.sectionId).trim() : null
    const documentId = (body.documentId != null ? String(body.documentId).trim() : null) || query.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null
    const month = body.month != null ? (typeof body.month === 'number' ? body.month : parseInt(String(body.month), 10)) : (query.get('month') != null ? parseInt(String(query.get('month')), 10) : (q.month != null ? parseInt(String(q.month), 10) : null))
    const year = body.year != null ? (typeof body.year === 'number' ? body.year : parseInt(String(body.year), 10)) : (query.get('year') != null ? parseInt(String(query.get('year')), 10) : (q.year != null ? parseInt(String(q.year), 10) : null))
    const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
    const hasCellContext = !!(sectionId && cell)

    if (!subject) {
      return badRequest(res, 'Subject is required')
    }
    if (!html && !text) {
      return badRequest(res, 'Either html or text body is required')
    }
    const validTo = to.filter((e) => isValidEmail(e))
    if (validTo.length === 0) {
      return badRequest(res, 'At least one valid recipient email is required')
    }
    const validCc = cc.filter((e) => isValidEmail(e))

    const user = req.user || {}
    const userName = user.name || user.email || ''
    const userEmail = user.email || ''
    const sentByLine = userName && userEmail
      ? `\n\n—\nSent by ${userName} (${userEmail})`
      : userEmail
        ? `\n\n—\nSent by ${userEmail}`
        : ''
    if (sentByLine) {
      if (html) html = html + sentByLine.replace(/\n/g, '<br>')
      if (text) text = text + sentByLine
    }

    const inboundEmail = process.env.DOCUMENT_REQUEST_INBOUND_EMAIL || process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS || ''
    const replyTo = hasCellContext && inboundEmail && isValidEmail(inboundEmail)
      ? inboundEmail
      : (userEmail && isValidEmail(userEmail) ? userEmail : undefined)
    const fromName = userName ? `Abcotronics (via ${userName})` : undefined
    // Send from documents@abcoafrica.co.za when inbound address is set (so From and Reply-To match)
    const fromAddress = inboundEmail && isValidEmail(inboundEmail) ? inboundEmail : undefined

    const sent = []
    const failed = []
    // For reply routing: use custom Message-ID when inbound is set so reply In-Reply-To can be matched
    let messageIdForReply = null
    if (hasCellContext) {
      const domain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1] : 'local'
      messageIdForReply = `docreq-${crypto.randomUUID()}@${domain}`
    }

    try {
      const result = await sendEmail({
        to: validTo.map((e) => e.trim()),
        cc: validCc.length > 0 ? validCc.map((e) => e.trim()) : undefined,
        subject,
        html: html || undefined,
        text: text || undefined,
        replyTo,
        fromName,
        ...(fromAddress && { from: fromAddress }),
        ...(messageIdForReply && {
          headers: {
            'Message-ID': messageIdForReply.startsWith('<') ? messageIdForReply : `<${messageIdForReply}>`
          }
        })
      })
      validTo.forEach((e) => sent.push(e.trim()))
      validCc.forEach((e) => sent.push(e.trim()))
    } catch (err) {
      validTo.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
      validCc.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
    }

    // Log for activity view whenever we have a valid cell and at least one send (do not require sectionId)
    if (sent.length > 0 && cell) {
      const bodyForLog = typeof text === 'string' && text.trim()
        ? text.trim().slice(0, 50000)
        : typeof html === 'string' && html
          ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000)
          : null
      try {
        await prisma.documentCollectionEmailLog.create({
          data: {
            projectId: cell.projectId,
            documentId: cell.documentId,
            year: cell.year,
            month: cell.month,
            kind: 'sent',
            ...(sectionId ? { sectionId } : {}),
            ...(subject ? { subject: subject.slice(0, 1000) } : {}),
            ...(bodyForLog ? { bodyText: bodyForLog } : {})
          }
        })
        console.log('document-collection-send-email: activity log created', { projectId: cell.projectId, sectionId: sectionId || null, documentId: cell.documentId, month: cell.month, year: cell.year })
      } catch (logErr) {
        const code = logErr.code || logErr.meta?.code || ''
        console.error('document-collection-send-email: log create failed:', logErr.message, code ? { code } : {}, { projectId: cell.projectId, documentId: cell.documentId, year: cell.year, month: cell.month })
        const hint = code === 'P2021' || /does not exist|relation.*does not exist/i.test(logErr.message || '')
          ? ' The DocumentCollectionEmailLog table may be missing — run: npx prisma migrate deploy'
          : ''
        return ok(res, { sent, failed, warning: 'Email sent but activity log could not be saved.' + hint + ' Sent items may not appear under Email activity.' })
      }
      // 2) Store messageId for reply routing (inbound webhook) — always when we have custom Message-ID so replies can be matched
      if (messageIdForReply) {
        try {
          await prisma.documentRequestEmailSent.create({
            data: {
              messageId: messageIdForReply,
              projectId: cell.projectId,
              ...(sectionId ? { sectionId } : {}),
              documentId: cell.documentId,
              year: cell.year,
              month: cell.month
            }
          })
        } catch (dbErr) {
          console.warn('document-collection-send-email: reply routing record failed (non-blocking):', dbErr.message)
        }
      }
    } else {
      if (sent.length === 0) {
        console.log('document-collection-send-email: skipping activity log (no successful sends)', { hasCell: !!cell, projectId, documentId: body.documentId ?? query.get('documentId'), month: body.month ?? query.get('month'), year: body.year ?? query.get('year') })
      } else if (!cell) {
        console.warn('document-collection-send-email: skipping activity log (no cell) — activity will not persist after refresh', { projectId, fromBody: { documentId: body.documentId, month: body.month, year: body.year }, fromQuery: { documentId: query.get('documentId') || q.documentId, month: query.get('month') || q.month, year: query.get('year') || q.year }, parsed: { documentId, month, year } })
      }
    }

    return ok(res, { sent, failed, messageId: messageIdForReply || undefined })
  } catch (e) {
    console.error('POST /api/projects/:id/document-collection-send-email error:', e)
    return serverError(res, e.message || 'Failed to send document request emails')
  }
}

export default authRequired(handler)
