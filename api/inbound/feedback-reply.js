/**
 * POST /api/inbound/feedback-reply
 * Resend email.received webhook: when a reply is received at the feedback inbound address,
 * match by In-Reply-To to FeedbackEmailSent, then create a FeedbackReply as the author (From).
 *
 * Setup: In Resend enable "Receive" for your domain (e.g. feedback@ or replies@), add a webhook
 * for event "email.received" to: https://your-domain/api/inbound/feedback-reply
 * Set FEEDBACK_REPLY_EMAIL to that address and use it as Reply-To when sending feedback notifications.
 */
import crypto from 'crypto'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'

const SIGNATURE_TOLERANCE_SEC = parseInt(process.env.RESEND_WEBHOOK_TOLERANCE_SEC || '86400', 10) || 86400

function normalizeMessageId(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/^<|>$/g, '').trim()
}

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

function getInReplyTo(email) {
  const h = normalizeHeaders(email?.headers || {})
  let raw = h['in-reply-to'] || h['in_reply_to'] || email?.in_reply_to
  if (raw) return normalizeMessageId(raw)
  if (email?.references && typeof email.references === 'string') {
    const first = email.references.trim().split(/\s+/)[0]
    if (first) return normalizeMessageId(first)
  }
  return null
}

function emailBodyText(email) {
  const text = email?.text
  if (text && typeof text === 'string' && text.trim()) return text.trim().slice(0, 5000)
  const html = email?.html
  if (html && typeof html === 'string') {
    const stripped = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .slice(0, 5000)
    if (stripped) return stripped
  }
  return ''
}

function extractFromEmail(email) {
  const from = email?.from
  if (!from || typeof from !== 'string') return null
  const match = from.match(/<([^>]+)>/)
  if (match && match[1]) return match[1].trim().toLowerCase()
  return from.trim().toLowerCase()
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
  const signatures = String(sigHeader).split(/\s+/)
  for (const part of signatures) {
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

async function fetchReceivedEmail(emailId, apiKey) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend get received email failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function processFeedbackReply(emailId, apiKey) {
  const email = await fetchReceivedEmail(emailId, apiKey)
  const inReplyTo = getInReplyTo(email)
  if (!inReplyTo) {
    console.warn('feedback-reply: no In-Reply-To in email', { emailId })
    return { processed: false, reason: 'no_in_reply_to' }
  }

  const sent = await prisma.feedbackEmailSent.findUnique({
    where: { messageId: inReplyTo },
    select: { feedbackId: true }
  })
  if (!sent) {
    console.warn('feedback-reply: no FeedbackEmailSent for messageId', { inReplyTo: inReplyTo.slice(0, 60), emailId })
    return { processed: false, reason: 'no_feedback_match' }
  }

  const bodyText = emailBodyText(email)
  if (!bodyText || !bodyText.trim()) {
    console.warn('feedback-reply: empty body', { emailId, feedbackId: sent.feedbackId })
    return { processed: false, reason: 'empty_body' }
  }

  const fromEmail = extractFromEmail(email)
  if (!fromEmail) {
    console.warn('feedback-reply: no From address', { emailId })
    return { processed: false, reason: 'no_from' }
  }

  const user = await prisma.user.findUnique({
    where: { email: fromEmail },
    select: { id: true, name: true, email: true }
  })
  if (!user) {
    console.warn('feedback-reply: no user for From', { fromEmail, emailId })
    return { processed: false, reason: 'user_not_found' }
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id: sent.feedbackId },
    select: { id: true, userId: true }
  })
  if (!feedback) {
    console.warn('feedback-reply: feedback not found', { feedbackId: sent.feedbackId })
    return { processed: false, reason: 'feedback_not_found' }
  }

  await prisma.feedbackReply.create({
    data: {
      feedbackId: sent.feedbackId,
      userId: user.id,
      message: bodyText.trim().slice(0, 5000)
    }
  })
  console.log('feedback-reply: created reply from email', { feedbackId: sent.feedbackId, fromEmail, emailId })
  return { processed: true, feedbackId: sent.feedbackId }
}

export async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(204).end()
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      endpoint: 'Resend email.received webhook (feedback reply)',
      method: 'POST',
      hint: 'Add a webhook for event "email.received" with this URL for your feedback/reply inbox.'
    })
  }
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'GET, POST, OPTIONS').json({ error: 'Method not allowed' })
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : '{}')
    const secret = process.env.FEEDBACK_REPLY_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      return serverError(res, 'Webhook is not configured', 'Set FEEDBACK_REPLY_WEBHOOK_SECRET or RESEND_WEBHOOK_SECRET.')
    }
    if (!verifyWebhookSignature(rawBody, req.headers || {}, secret)) {
      console.warn('feedback-reply: invalid webhook signature')
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }

    let body
    try {
      body = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body) ? req.body : JSON.parse(rawBody)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }

    const data = body.data || body.payload?.data || body
    const emailId = data?.email_id || data?.emailId || data?.id || body.email_id || body.emailId || body.id
    const eventType = body.type || body.event_type || data?.type || data?.event_type

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
      processFeedbackReply(emailId, apiKey).catch((e) => console.error('feedback-reply: background error', e))
    })
    return
  } catch (e) {
    console.error('POST /api/inbound/feedback-reply error:', e)
    return serverError(res, e.message || 'Failed to process feedback reply')
  }
}

export default handler
