/**
 * POST /api/inbound/project-correspondence-reply
 * Resend email.received webhook: route replies to project correspondence threads.
 *
 * Production Resend webhooks usually point at document-request-reply only; that handler
 * delegates here when the message is To/Cc on a *_mailtrack@ inbox address (legacy *_doc_proj@ also matched).
 */
import crypto from 'crypto'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { createNotificationForUser } from '../notifications.js'
import {
  collectInboundRecipientEmails,
  ensureCorrespondenceTables,
  findProjectByCorrespondenceInbox,
  generateCorrespondenceRequestNumber,
  normalizeMessageId,
  parseCorrespondenceEntry,
  serializeJsonArray,
  touchThreadActivity
} from '../_lib/projectCorrespondence.js'
import {
  fetchResendReceivedEmail,
  saveReceivedAttachments,
  saveReceivedEmailArchive
} from '../_lib/correspondenceEmailStorage.js'

const SIGNATURE_TOLERANCE_SEC = parseInt(process.env.RESEND_WEBHOOK_TOLERANCE_SEC || '86400', 10) || 86400

function normalizeHeaders(headers) {
  if (!headers) return {}
  if (Array.isArray(headers)) {
    const out = {}
    for (const h of headers) {
      if (h && typeof h === 'object') {
        const k = (h.name || h.key || '').toLowerCase().trim()
        const v = h.value ?? h.val ?? ''
        if (k) out[k] = String(v)
      }
    }
    return out
  }
  if (typeof headers === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(headers)) {
      if (k && v != null) out[k.toLowerCase()] = String(v)
    }
    return out
  }
  return {}
}

function getMessageIdCandidates(email) {
  const h = normalizeHeaders(email?.headers || {})
  const out = []
  const push = (v) => {
    const n = normalizeMessageId(v)
    if (n) out.push(n)
  }
  push(h['in-reply-to'] || h.in_reply_to || email?.in_reply_to)
  const refs = h.references || email?.references
  if (refs && typeof refs === 'string') {
    refs.split(/\s+/).forEach(push)
  }
  return [...new Set(out)]
}

function extractFromEmail(email) {
  const from = email?.from
  if (!from || typeof from !== 'string') return null
  const match = from.match(/<([^>]+)>/)
  if (match && match[1]) return match[1].trim()
  return from.trim()
}

function normalizeEmailList(value) {
  if (!value) return []
  if (typeof value === 'string') {
    const out = []
    for (const p of value.split(/[;,]+/)) {
      const m = p.match(/<([^>]+)>/)
      const email = (m && m[1] ? m[1] : p).trim().toLowerCase()
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push(email)
    }
    return out
  }
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) {
      if (!item) continue
      if (typeof item === 'string') out.push(...normalizeEmailList(item))
      else if (typeof item === 'object') {
        const email = item.email || item.address || item.value || ''
        out.push(...normalizeEmailList(String(email)))
      }
    }
    return out
  }
  return []
}

function emailBodyText(email) {
  const text = email?.text
  if (text && typeof text === 'string' && text.trim()) return text.trim().slice(0, 50000)
  const html = email?.html
  if (html && typeof html === 'string') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .slice(0, 50000)
  }
  return ''
}

function parseRequestNumberFromSubject(subject) {
  if (!subject || typeof subject !== 'string') return null
  const m = subject.match(/\[Req\s+(CORR-[A-Za-z0-9-]+)\]/i)
  return m ? m[1].trim() : null
}

function verifyWebhookSignature(rawBody, headers, secret) {
  if (!secret || typeof rawBody !== 'string') return false
  const id = headers['svix-id']
  const timestamp = headers['svix-timestamp']
  const sigHeader = headers['svix-signature']
  if (!id || !timestamp || !sigHeader) return false
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(ts - Math.floor(Date.now() / 1000)) > SIGNATURE_TOLERANCE_SEC) return false
  const base64Secret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let key
  try {
    key = Buffer.from(base64Secret, 'base64')
  } catch (_) {
    return false
  }
  const signedContent = `${id}.${timestamp}.${rawBody}`
  const expectedBuf = crypto.createHmac('sha256', key).update(signedContent).digest()
  for (const part of String(sigHeader).split(/\s+/)) {
    const match = part.match(/^v1,(.+)$/)
    if (!match) continue
    let receivedBuf
    try {
      receivedBuf = Buffer.from(match[1], 'base64')
    } catch (_) {
      continue
    }
    if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) return true
  }
  return false
}

async function recordUnmatched(emailId, fromAddress, subject, candidates, reason) {
  try {
    await prisma.projectCorrespondenceInboundUnmatched.upsert({
      where: { emailId },
      create: {
        emailId,
        fromAddress,
        subject,
        candidatesJson: JSON.stringify(candidates || []),
        reason: reason || 'no_match'
      },
      update: {
        fromAddress,
        subject,
        candidatesJson: JSON.stringify(candidates || []),
        reason: reason || 'no_match'
      }
    })
  } catch (_) {}
}

export async function processProjectCorrespondenceReceivedEmail(emailId, apiKey, webhookPayload = null) {
  await ensureCorrespondenceTables()

  const existing = await prisma.projectCorrespondenceEntry.findFirst({
    where: { kind: 'received', messageId: emailId },
    select: { id: true }
  })
  if (existing) {
    return { processed: false, reason: 'duplicate' }
  }

  const email = await fetchResendReceivedEmail(emailId, apiKey)
  const webhookAttachments =
    webhookPayload?.attachments ||
    webhookPayload?.data?.attachments ||
    null
  const candidates = getMessageIdCandidates(email)
  const fromEmail = extractFromEmail(email)
  const subject = (email.subject || '').toString()
  const bodyText = emailBodyText(email)
  const recipientEmails = collectInboundRecipientEmails(email, webhookPayload)
  const toEmails = normalizeEmailList(email.to)
  const ccEmails = [
    ...normalizeEmailList(email.cc),
    ...normalizeEmailList(email.ccs)
  ]

  let thread = null
  let matchMethod = null
  let matchedProject = null

  if (candidates.length > 0) {
    const sentEntry = await prisma.projectCorrespondenceEntry.findFirst({
      where: {
        kind: 'sent',
        messageId: { in: candidates }
      },
      include: { thread: true }
    })
    if (sentEntry?.thread) {
      thread = sentEntry.thread
      matchMethod = 'message_id'
    }
  }

  if (!thread) {
    const reqNum = parseRequestNumberFromSubject(subject)
    if (reqNum) {
      thread = await prisma.projectCorrespondenceThread.findFirst({
        where: { requestNumber: reqNum }
      })
      if (thread) matchMethod = 'request_number'
    }
  }

  if (!thread) {
    matchedProject = await findProjectByCorrespondenceInbox(recipientEmails)
    if (matchedProject) {
      matchMethod = 'project_inbox'
      const requestNumber = generateCorrespondenceRequestNumber(new Date().getFullYear())
      const cleanSubject = subject.trim() || 'Inbound correspondence'
      thread = await prisma.projectCorrespondenceThread.create({
        data: {
          projectId: matchedProject.id,
          subject: cleanSubject.slice(0, 500),
          requestNumber,
          correspondenceType: 'email',
          status: 'open',
          counterparty: fromEmail || null,
          lastActivityAt: new Date()
        }
      })
    }
  }

  if (!thread) {
    await recordUnmatched(emailId, fromEmail, subject, [...candidates, ...recipientEmails], 'no_match')
    return { processed: false, reason: 'no_match' }
  }

  const attachments = await saveReceivedAttachments(emailId, apiKey, webhookAttachments, email)
  let emailArchivePath = null
  let rawEmailPath = null
  try {
    const archive = await saveReceivedEmailArchive(emailId, email, apiKey, attachments)
    emailArchivePath = archive.emailArchivePath
    rawEmailPath = archive.rawEmailPath
  } catch (e) {
    console.warn('project-correspondence-reply: email archive save failed', e?.message)
  }
  const now = new Date()

  const entry = await prisma.projectCorrespondenceEntry.create({
    data: {
      projectId: thread.projectId,
      threadId: thread.id,
      kind: 'received',
      direction: 'inbound',
      correspondenceType: 'email',
      subject: subject.slice(0, 1000),
      bodyText: bodyText || '(No text body)',
      bodyHtml: email?.html ? String(email.html).slice(0, 100000) : null,
      occurredAt: now,
      fromEmail: fromEmail || null,
      toEmails: serializeJsonArray(toEmails),
      ccEmails: serializeJsonArray(ccEmails),
      contactName: fromEmail || null,
      messageId: emailId,
      deliveryStatus: 'delivered',
      deliveredAt: now,
      attachments: serializeJsonArray(attachments),
      emailArchivePath,
      rawEmailPath
    }
  })

  await touchThreadActivity(thread.id, now)

  const notifyUserId = thread.createdById
  if (notifyUserId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: thread.projectId },
        select: { name: true }
      })
      await createNotificationForUser(
        notifyUserId,
        'project_correspondence_reply',
        'Project correspondence reply received',
        `${project?.name || 'Project'}: ${thread.subject}`,
        `/projects?projectId=${encodeURIComponent(thread.projectId)}&tab=correspondence&corrThreadId=${encodeURIComponent(thread.id)}`,
        JSON.stringify({ projectId: thread.projectId, threadId: thread.id, entryId: entry.id })
      )
    } catch (e) {
      console.warn('project-correspondence-reply: notification failed', e?.message)
    }
  }

  console.log('project-correspondence-reply: stored received entry', {
    emailId,
    threadId: thread.id,
    matchMethod,
    entryId: entry.id,
    attachmentCount: attachments.length,
    emailArchivePath,
    rawEmailPath
  })

  return {
    processed: true,
    threadId: thread.id,
    entry: parseCorrespondenceEntry(entry),
    matchMethod
  }
}

export async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(204).end()
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      endpoint: 'Resend email.received webhook (project correspondence reply)',
      method: 'POST'
    })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : ''
    const secret = process.env.RESEND_WEBHOOK_SECRET || ''
    if (secret && rawBody) {
      const verified = verifyWebhookSignature(rawBody, req.headers || {}, secret)
      if (!verified) {
        console.warn('project-correspondence-reply: invalid webhook signature')
        return res.status(401).json({ error: 'Invalid webhook signature' })
      }
    }

    let body
    try {
      body = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)
        ? req.body
        : JSON.parse(rawBody || '{}')
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }

    const data = body.data || body.payload?.data || body
    const emailId =
      (data && (data.email_id || data.emailId || data.id)) ||
      body.email_id ||
      body.emailId ||
      null
    const eventType = body.type || body.event_type || (data && (data.type || data.event_type))

    if (eventType !== 'email.received') {
      return ok(res, { processed: false, reason: 'not_email_received', receivedType: eventType })
    }
    if (!emailId) {
      return ok(res, { processed: false, reason: 'missing_email_id' })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey || !apiKey.startsWith('re_')) {
      return ok(res, { processed: false, reason: 'no_resend_api_key' })
    }

    res.status(200).json({ received: true, processing: 'async' })
    setImmediate(() => {
      processProjectCorrespondenceReceivedEmail(emailId, apiKey, data).catch((e) => {
        console.error('project-correspondence-reply: background error', e)
      })
    })
    return
  } catch (e) {
    console.error('project-correspondence-reply:', e)
    return serverError(res, e.message || 'Failed to process correspondence reply')
  }
}

export default handler
