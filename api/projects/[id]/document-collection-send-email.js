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

  const pathOrUrl = (req.originalUrl || req.url || req.path || '').split('?')[0].split('#')[0]
  const match = pathOrUrl.match(/(?:\/api)?\/projects\/([^/]+)\/document-collection-send-email/)
  const rawId = (req.params && req.params.id) || (match ? match[1] : null)
  const projectId = rawId ? String(rawId).trim() : null
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  try {
    const body = await parseJsonBody(req)
    const to = Array.isArray(body.to) ? body.to : (typeof body.to === 'string' ? [body.to] : [])
    const cc = Array.isArray(body.cc) ? body.cc : (typeof body.cc === 'string' ? [body.cc] : [])
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    let html = typeof body.html === 'string' ? body.html.trim() : ''
    let text = typeof body.text === 'string' ? body.text.trim() : undefined
    const sectionId = body.sectionId != null ? String(body.sectionId).trim() : null
    const documentId = body.documentId != null ? String(body.documentId).trim() : null
    const month = body.month != null ? (typeof body.month === 'number' ? body.month : parseInt(String(body.month), 10)) : null
    const year = body.year != null ? (typeof body.year === 'number' ? body.year : parseInt(String(body.year), 10)) : null
    const normalizedProjectId = projectId ? String(projectId).trim() : null

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
    const hasCellContext = sectionId && documentId && month != null && !isNaN(month) && year != null && !isNaN(year)
    const replyTo = hasCellContext && inboundEmail && isValidEmail(inboundEmail)
      ? inboundEmail
      : (userEmail && isValidEmail(userEmail) ? userEmail : undefined)
    const fromName = userName ? `Abcotronics (via ${userName})` : undefined
    // Send from documents@abcoafrica.co.za when inbound address is set (so From and Reply-To match)
    const fromAddress = inboundEmail && isValidEmail(inboundEmail) ? inboundEmail : undefined

    const sent = []
    const failed = []
    // For reply routing: use custom Message-ID when inbound is set; otherwise generate one so we always persist for activity view
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

    // Persist sent record only when email was actually sent, so "Email activity" shows sent items after refresh
    if (sent.length > 0 && messageIdForReply && hasCellContext && normalizedProjectId && sectionId && documentId && month >= 1 && month <= 12 && year) {
      try {
        await prisma.documentRequestEmailSent.create({
          data: {
            messageId: messageIdForReply,
            projectId: normalizedProjectId,
            sectionId,
            documentId,
            year: Number(year),
            month: Number(month)
          }
        })
      } catch (dbErr) {
        console.error('document-collection-send-email: failed to store sent record:', dbErr.message, { projectId: normalizedProjectId, documentId, year, month })
      }
    }

    return ok(res, { sent, failed, messageId: messageIdForReply || undefined })
  } catch (e) {
    console.error('POST /api/projects/:id/document-collection-send-email error:', e)
    return serverError(res, e.message || 'Failed to send document request emails')
  }
}

export default authRequired(handler)
