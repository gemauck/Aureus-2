/**
 * POST /api/projects/:id/correspondence-send-email — send email in a correspondence thread
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { sendEmail } from '../../_lib/email.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../_lib/projectActivityLog.js'
import { saveSentEmailArchive } from '../../_lib/correspondenceEmailStorage.js'
import {
  assertProjectCorrespondenceEnabled,
  ensureCorrespondenceTables,
  getCorrespondenceInboundEmail,
  isValidEmail,
  parseJsonArrayStored,
  normalizeCorrespondenceType,
  parseCorrespondenceEntry,
  serializeJsonArray,
  touchThreadActivity
} from '../../_lib/projectCorrespondence.js'

function normalizeEmailList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const email = String(item || '').trim()
    if (!isValidEmail(email)) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function resolveOutboundAttachments(attachments) {
  const rootDir = path.resolve(__dirname, '../../..')
  const out = []
  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue
    const filename = String(item.fileName || item.name || '').trim()
    let contentBase64 = String(item.contentBase64 || item.base64 || '').trim()
    const filePath = String(item.filePath || item.url || '').trim()
    if (!filename) continue
    if (!contentBase64 && filePath) {
      try {
        const rel = filePath.replace(/^\//, '')
        const full = path.join(rootDir, rel)
        if (full.startsWith(rootDir) && fs.existsSync(full)) {
          contentBase64 = fs.readFileSync(full).toString('base64')
        }
      } catch (_) {}
    }
    if (!contentBase64) continue
    out.push({
      filename,
      contentBase64,
      contentType: String(item.mimeType || item.contentType || 'application/octet-stream')
    })
  }
  return out
}

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  const userId = req.user?.sub || req.user?.id
  const userEmail = req.user?.email || ''
  const userName = req.user?.name || req.user?.email || 'User'
  if (!userId) return badRequest(res, 'User not authenticated')

  try {
    await ensureCorrespondenceTables()
    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    const body = await parseJsonBody(req)
    const threadId = (body?.threadId && String(body.threadId).trim()) || ''
    if (!threadId) return badRequest(res, 'threadId is required')

    const thread = await prisma.projectCorrespondenceThread.findFirst({
      where: { id: threadId, projectId }
    })
    if (!thread) return notFound(res, 'Thread not found')

    const to = normalizeEmailList(Array.isArray(body.to) ? body.to : (body.to ? [body.to] : []))
    let cc = normalizeEmailList(Array.isArray(body.cc) ? body.cc : (body.cc ? [body.cc] : []))
    let subject = typeof body.subject === 'string' ? body.subject.trim() : thread.subject
    let text = typeof body.text === 'string' ? body.text.trim() : ''
    let html = typeof body.html === 'string' ? body.html.trim() : ''
    const attachments = Array.isArray(body.attachments) ? body.attachments : []

    if (!subject) return badRequest(res, 'Subject is required')
    if (!text && !html) return badRequest(res, 'Message body is required')
    if (to.length === 0) return badRequest(res, 'At least one recipient is required')

    const requestNumber = thread.requestNumber || null
    const inboundEmail = requestNumber ? getCorrespondenceInboundEmail(requestNumber) : null
    const projectInbox = gate.project?.correspondenceInboundEmail || null
    const requesterAddress = isValidEmail(userEmail) ? userEmail.trim() : ''

    if (requestNumber && !subject.includes(requestNumber)) {
      subject = `${subject} [Req ${requestNumber}]`
    }

    if (requesterAddress && !cc.some((e) => e.toLowerCase() === requesterAddress.toLowerCase())) {
      cc = [...cc, requesterAddress]
    }
    if (projectInbox && isValidEmail(projectInbox) && !cc.some((e) => e.toLowerCase() === projectInbox.toLowerCase())) {
      cc = [...cc, projectInbox]
    }

    const replyAllLine =
      '\n\nPlease use "Reply All" when responding so that both our system and the person who sent this message receive your response.'
    const replyAllHtml =
      '<p style="margin-top:12px;font-size:12px;color:#64748b;">Please use "Reply All" when responding so that both our system and the person who sent this message receive your response.</p>'

    if (text && !text.includes('Reply All')) text += replyAllLine
    if (html && !html.includes('Reply All')) html += replyAllHtml
    if (requestNumber) {
      const refFooterText = `\n\nRequest ref: ${requestNumber}`
      const refFooterHtml = `<p style="margin-top:12px;font-size:12px;color:#64748b;">Request ref: ${requestNumber}</p>`
      if (text && !text.includes(requestNumber)) text += refFooterText
      if (html && !html.includes(requestNumber)) html += refFooterHtml
    }

    const replyTo = inboundEmail && isValidEmail(inboundEmail) ? inboundEmail : (requesterAddress || undefined)
    const defaultFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || ''
    const defaultFromEmail = defaultFrom && defaultFrom.includes('<')
      ? (defaultFrom.match(/<(.+)>/)?.[1] || defaultFrom).trim()
      : String(defaultFrom || '').trim()
    const inboundDomain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1].trim().toLowerCase() : ''
    const defaultFromDomain = defaultFromEmail && defaultFromEmail.includes('@') ? defaultFromEmail.split('@')[1].trim().toLowerCase() : ''
    let fromAddress = defaultFromEmail
    if (inboundEmail && isValidEmail(inboundEmail) && inboundDomain && defaultFromDomain && inboundDomain === defaultFromDomain) {
      fromAddress = inboundEmail
    }

    let customMessageId = null
    if (inboundEmail && isValidEmail(inboundEmail)) {
      const domain = inboundEmail.split('@')[1] || 'local'
      customMessageId = `corr-${crypto.randomUUID()}@${domain}`
    }

    const emailHeaders = {}
    if (customMessageId) {
      emailHeaders['Message-ID'] = customMessageId.startsWith('<') ? customMessageId : `<${customMessageId}>`
    }
    if (requestNumber) {
      emailHeaders['X-Abcotronics-Corr-Req'] = requestNumber
    }

    const outboundAttachments = await resolveOutboundAttachments(attachments)

    let providerMessageId = null
    let sendError = null
    try {
      const result = await sendEmail({
        to,
        cc: cc.length > 0 ? cc : undefined,
        subject,
        html: html || undefined,
        text: text || undefined,
        replyTo,
        fromName: userName ? `Abcotronics (via ${userName})` : undefined,
        ...(fromAddress && isValidEmail(fromAddress) ? { from: fromAddress } : {}),
        ...(Object.keys(emailHeaders).length > 0 ? { headers: emailHeaders } : {}),
        ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {})
      })
      providerMessageId = result?.messageId || customMessageId?.replace(/[<>]/g, '') || null
    } catch (err) {
      sendError = err.message || 'Send failed'
    }

    if (sendError) {
      return serverError(res, 'Failed to send email', sendError)
    }

    const bodyForStorage = text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
    const storedMessageId = customMessageId
      ? customMessageId.replace(/[<>]/g, '')
      : (providerMessageId || null)

    const entry = await prisma.projectCorrespondenceEntry.create({
      data: {
        projectId,
        threadId,
        kind: 'sent',
        direction: 'outbound',
        correspondenceType: normalizeCorrespondenceType(body.correspondenceType, 'email'),
        subject: subject.slice(0, 1000),
        bodyText: bodyForStorage.slice(0, 50000),
        bodyHtml: html ? html.slice(0, 100000) : null,
        occurredAt: new Date(),
        authorId: userId,
        fromEmail: fromAddress || defaultFromEmail || null,
        toEmails: serializeJsonArray(to),
        ccEmails: serializeJsonArray(cc),
        messageId: storedMessageId,
        deliveryStatus: 'sent',
        attachments: serializeJsonArray(
          attachments.map((a) => ({
            fileName: a.fileName || a.name,
            filePath: a.filePath || a.url,
            mimeType: a.mimeType,
            size: a.size
          }))
        )
      },
      include: {
        author: { select: { id: true, name: true, email: true } }
      }
    })

    let emailArchivePath = null
    try {
      const archive = saveSentEmailArchive({
        entryId: entry.id,
        subject,
        fromEmail: fromAddress || defaultFromEmail || null,
        to,
        cc,
        text: bodyForStorage,
        html: html || null,
        messageId: storedMessageId,
        attachments
      })
      emailArchivePath = archive.emailArchivePath
      if (emailArchivePath) {
        await prisma.projectCorrespondenceEntry.update({
          where: { id: entry.id },
          data: { emailArchivePath }
        })
        entry.emailArchivePath = emailArchivePath
      }
    } catch (e) {
      console.warn('correspondence-send-email: archive save failed', e?.message)
    }

    await touchThreadActivity(threadId, entry.occurredAt)

    const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
    await logProjectActivity(prisma, {
      projectId,
      userId: uid,
      userName: uName,
      type: 'correspondence_sent',
      description: `Correspondence email sent: "${subject.slice(0, 80)}"`,
      metadata: { threadId, entryId: entry.id, requestNumber }
    })

    return ok(res, {
      entry: parseCorrespondenceEntry(entry),
      sent: [...to, ...cc],
      messageId: storedMessageId
    })
  } catch (e) {
    console.error('correspondence-send-email:', e)
    return serverError(res, 'Failed to send correspondence email', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
