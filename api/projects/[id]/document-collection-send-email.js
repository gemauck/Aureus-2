/**
 * POST /api/projects/:id/document-collection-send-email
 * Send document request emails to contacts. Used by Document Collection checklist
 * "Request documents" flow. Uses existing mail infrastructure (Resend/SendGrid/SMTP).
 * Optional body: sectionId, documentId, month, year — when provided, Reply-To is set
 * to the inbound address and a custom Message-ID is set so reply In-Reply-To matches.
 * The requester is CC'd so that "Reply All" from the recipient includes them (reduces risk
 * of missing replies if the inbound webhook fails). A short line in the body asks recipients
 * to use Reply All when responding.
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
    const requesterEmail = typeof body.requesterEmail === 'string' ? body.requesterEmail.trim() : ''
    // Cell keys: body first, then URL query (manual), then Express req.query so reply always persists
    let documentId = (body.documentId != null ? String(body.documentId).trim() : null) || query.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null
    let month = body.month != null ? (typeof body.month === 'number' ? body.month : parseInt(String(body.month), 10)) : (query.get('month') != null ? parseInt(String(query.get('month')), 10) : (q.month != null ? parseInt(String(q.month), 10) : null))
    let year = body.year != null ? (typeof body.year === 'number' ? body.year : parseInt(String(body.year), 10)) : (query.get('year') != null ? parseInt(String(query.get('year')), 10) : (q.year != null ? parseInt(String(q.year), 10) : null))
    if (documentId == null && q.documentId != null) documentId = String(q.documentId).trim()
    if (month == null || isNaN(month)) month = q.month != null ? parseInt(String(q.month), 10) : null
    if (year == null || isNaN(year)) year = q.year != null ? parseInt(String(q.year), 10) : null
    // Header fallback (proxies sometimes strip query/body for POST)
    const h = req.headers || {}
    if (documentId == null && h['x-document-id']) documentId = String(h['x-document-id']).trim()
    if ((month == null || isNaN(month)) && h['x-month'] != null) month = parseInt(String(h['x-month']), 10)
    if ((year == null || isNaN(year)) && h['x-year'] != null) year = parseInt(String(h['x-year']), 10)
    const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
    const hasCellContext = !!cell

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
    let validCc = cc.filter((e) => isValidEmail(e))

    const user = req.user || {}
    const userName = user.name || user.email || ''
    const userEmail = user.email || ''
    const requesterAddress = requesterEmail && isValidEmail(requesterEmail)
      ? requesterEmail
      : (userEmail && isValidEmail(userEmail) ? userEmail : '')
    const sentByLine = userName && userEmail
      ? `\n\n—\nSent by ${userName} (${userEmail})`
      : userEmail
        ? `\n\n—\nSent by ${userEmail}`
        : ''
    if (sentByLine) {
      if (html) html = html + sentByLine.replace(/\n/g, '<br>')
      if (text) text = text + sentByLine
    }

    // When using inbound (documents@): CC the requester so "Reply All" includes them and they don't miss replies
    const inboundEmail = process.env.DOCUMENT_REQUEST_INBOUND_EMAIL || process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS || ''
    if (hasCellContext && inboundEmail && isValidEmail(inboundEmail) && requesterAddress) {
      const requesterNorm = requesterAddress.trim().toLowerCase()
      const inTo = validTo.some((e) => e.trim().toLowerCase() === requesterNorm)
      const inCc = validCc.some((e) => e.trim().toLowerCase() === requesterNorm)
      if (!inTo && !inCc) {
        validCc = [...validCc.map((e) => e.trim()), requesterAddress.trim()]
      }
    }

    const replyAllLine = '\n\nPlease use "Reply All" when responding so that both our system and the person who requested these documents receive your response.'
    if (hasCellContext && inboundEmail && isValidEmail(inboundEmail)) {
      if (html) html = html + replyAllLine.replace(/\n/g, '<br>')
      if (text) text = text + replyAllLine
    }

    const replyTo = hasCellContext && inboundEmail && isValidEmail(inboundEmail)
      ? inboundEmail
      : (requesterAddress ? requesterAddress : undefined)
    const fromName = userName ? `Abcotronics (via ${userName})` : undefined
    // Prefer a verified From domain to avoid recipient policy rejections (Mimecast, etc.)
    const defaultFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || ''
    const defaultFromEmail = defaultFrom && defaultFrom.includes('<')
      ? (defaultFrom.match(/<(.+)>/)?.[1] || defaultFrom).trim()
      : String(defaultFrom || '').trim()
    const inboundDomain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1].trim().toLowerCase() : ''
    const defaultFromDomain = defaultFromEmail && defaultFromEmail.includes('@') ? defaultFromEmail.split('@')[1].trim().toLowerCase() : ''
    let fromAddress
    if (inboundEmail && isValidEmail(inboundEmail) && inboundDomain && defaultFromDomain && inboundDomain === defaultFromDomain) {
      // Domains align; safe to send from inbound address
      fromAddress = inboundEmail
    } else if (defaultFromEmail && isValidEmail(defaultFromEmail)) {
      // Use verified From to satisfy SPF/DKIM/DMARC alignment
      fromAddress = defaultFromEmail
      if (inboundEmail && isValidEmail(inboundEmail) && inboundDomain && defaultFromDomain && inboundDomain !== defaultFromDomain) {
        console.warn('document-collection-send-email: inbound domain differs from EMAIL_FROM; using EMAIL_FROM for From to avoid policy rejection', {
          inboundDomain,
          defaultFromDomain
        })
      }
    } else if (inboundEmail && isValidEmail(inboundEmail)) {
      fromAddress = inboundEmail
    }

    const sent = []
    const failed = []
    // For reply routing: use custom Message-ID when inbound is set so reply In-Reply-To can be matched
    let messageIdForReply = null
    if (hasCellContext) {
      const domain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1] : 'local'
      messageIdForReply = `docreq-${crypto.randomUUID()}@${domain}`
    }

    let providerMessageId = null
    try {
      const result = await sendEmail({
        to: validTo.map((e) => e.trim()),
        cc: validCc.length > 0 ? [...new Set(validCc.map((e) => e.trim()))] : undefined,
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
      providerMessageId = result?.messageId || null
      validTo.forEach((e) => sent.push(e.trim()))
      validCc.forEach((e) => sent.push(e.trim()))
    } catch (err) {
      validTo.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
      validCc.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
    }

    // Persist for activity view. Replies (Re:) use DocumentItemComment only so they always show; initial sends use DocumentCollectionEmailLog.
    const isReply = (subject || '').trim().toLowerCase().startsWith('re:')
    let activityPersisted = false
    let logId = null
    if (sent.length > 0 && cell) {
      const bodyForStorage = typeof text === 'string' && text.trim()
        ? text.trim().slice(0, 50000)
        : typeof html === 'string' && html
          ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000)
          : ''
      const commentText = `Subject: ${(subject || '').slice(0, 500)}\n\n${bodyForStorage}`

      if (isReply) {
        // Replies: persist only as comment (same table as received emails — always works)
        try {
          await prisma.documentItemComment.create({
            data: {
              itemId: cell.documentId,
              year: cell.year,
              month: cell.month,
              text: commentText,
              author: 'Sent reply (platform)'
            }
          })
          activityPersisted = true
          console.log('document-collection-send-email: reply persisted as comment', { documentId: cell.documentId, month: cell.month, year: cell.year })
        } catch (commentErr) {
          console.error('document-collection-send-email: reply comment create failed:', commentErr.message, { documentId: cell.documentId, month: cell.month, year: cell.year })
        }
      } else {
        // Initial sends: use DocumentCollectionEmailLog
        try {
          const log = await prisma.documentCollectionEmailLog.create({
            data: {
              projectId: cell.projectId,
              documentId: cell.documentId,
              year: cell.year,
              month: cell.month,
              kind: 'sent',
              ...(sectionId ? { sectionId } : {}),
              ...(subject ? { subject: subject.slice(0, 1000) } : {}),
              ...(bodyForStorage ? { bodyText: bodyForStorage } : {}),
              ...(providerMessageId ? { messageId: providerMessageId } : {})
            }
          })
          activityPersisted = true
          logId = log.id
          console.log('document-collection-send-email: activity log created', { logId: log.id, projectId: cell.projectId, documentId: cell.documentId, month: cell.month, year: cell.year })
        } catch (logErr) {
          console.error('document-collection-send-email: log create failed:', logErr.message, { projectId: cell.projectId, documentId: cell.documentId })
        }
      }

    if (messageIdForReply) {
        try {
          await prisma.documentRequestEmailSent.create({
            data: {
              messageId: messageIdForReply,
              projectId: cell.projectId,
              ...(sectionId ? { sectionId } : {}),
              documentId: cell.documentId,
              year: cell.year,
              month: cell.month,
              ...(requesterAddress ? { requesterEmail: requesterAddress.trim() } : {})
            }
          })
        } catch (dbErr) {
          console.warn('document-collection-send-email: reply routing record failed (non-blocking):', dbErr.message)
        }
      }
    } else {
      if (sent.length === 0) {
        console.log('document-collection-send-email: skipping activity log (no successful sends)', { hasCell: !!cell, projectId, documentId: body.documentId ?? query.get('documentId') ?? q.documentId, month: body.month ?? query.get('month') ?? q.month, year: body.year ?? query.get('year') ?? q.year })
      } else if (!cell) {
        console.warn('document-collection-send-email: skipping activity log (no cell) — activity will not persist after refresh', { projectId, fromBody: { documentId: body.documentId, month: body.month, year: body.year }, fromQuery: { documentId: query.get('documentId') || q.documentId, month: query.get('month') || q.month, year: query.get('year') || q.year }, expressQuery: q, parsed: { documentId, month, year } })
      }
    }

    return ok(res, { sent, failed, activityPersisted, logId: logId || undefined, messageId: messageIdForReply || undefined })
  } catch (e) {
    console.error('POST /api/projects/:id/document-collection-send-email error:', e)
    return serverError(res, e.message || 'Failed to send document request emails')
  }
}

export default authRequired(handler)
