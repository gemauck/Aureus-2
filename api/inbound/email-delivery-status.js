/**
 * POST /api/inbound/email-delivery-status
 * Webhook for delivery events (Resend/Svix or SendGrid Event Webhook).
 * Updates DocumentCollectionEmailLog deliveryStatus by provider messageId.
 */
import crypto from 'crypto'
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest, serverError } from '../_lib/response.js'

const SIGNATURE_TOLERANCE_SEC = parseInt(process.env.RESEND_WEBHOOK_TOLERANCE_SEC || '86400', 10) || 86400

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

function normalizeMessageId(value) {
  return String(value || '').replace(/^<|>$/g, '').trim()
}

function mapResendStatus(eventType) {
  const t = String(eventType || '').toLowerCase()
  if (t === 'email.delivered') return 'delivered'
  if (t === 'email.bounced') return 'bounced'
  if (t === 'email.failed') return 'failed'
  if (t === 'email.sent') return 'sent'
  if (t === 'email.complained') return 'failed'
  return null
}

function mapSendGridStatus(event) {
  const t = String(event || '').toLowerCase()
  if (t === 'delivered') return 'delivered'
  if (t === 'bounce' || t === 'dropped') return 'bounced'
  if (t === 'deferred' || t === 'spamreport') return 'failed'
  if (t === 'processed') return 'sent'
  return null
}

async function updateLogForMessageId(messageId, status, reason, eventAt) {
  if (!messageId || !status) return { updated: 0 }
  const normalized = normalizeMessageId(messageId)
  const lastEventAt = eventAt || new Date()
  const data = {
    deliveryStatus: status,
    lastEventAt
  }
  if (status === 'delivered') data.deliveredAt = lastEventAt
  if (status === 'bounced' || status === 'failed') {
    data.bouncedAt = lastEventAt
    if (reason) data.bounceReason = String(reason).slice(0, 1000)
  }
  const res = await prisma.documentCollectionEmailLog.updateMany({
    where: { messageId: normalized },
    data
  })
  return { updated: res.count || 0 }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : '{}')
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET
    if (webhookSecret) {
      if (!verifyWebhookSignature(rawBody, req.headers || {}, webhookSecret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' })
      }
    }

    let body
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody)
    } catch (_) {
      return badRequest(res, 'Invalid JSON body')
    }

    // SendGrid: array of events
    if (Array.isArray(body)) {
      let updated = 0
      for (const evt of body) {
        if (!evt || typeof evt !== 'object') continue
        const status = mapSendGridStatus(evt.event)
        const messageId = evt.sg_message_id || evt['smtp-id'] || evt.message_id || evt.messageId
        const reason = evt.reason || evt.response || evt.status
        const eventAt = evt.timestamp ? new Date(evt.timestamp * 1000) : new Date()
        const result = await updateLogForMessageId(messageId, status, reason, eventAt)
        updated += result.updated
      }
      return ok(res, { processed: true, updated })
    }

    // Resend or generic object
    const data = body.data || body.payload?.data || body
    const eventType = body.type || body.event_type || data?.type || data?.event_type
    const status = mapResendStatus(eventType)
    const messageId =
      data?.email_id ||
      data?.emailId ||
      data?.id ||
      body.email_id ||
      body.emailId ||
      body.id ||
      null
    const reason =
      data?.bounce?.type ||
      data?.bounce?.reason ||
      data?.error ||
      data?.message ||
      data?.reason ||
      null
    const eventAt = data?.created_at ? new Date(data.created_at) : new Date()

    if (!messageId || !status) {
      return ok(res, { processed: false, reason: 'missing_message_id_or_status', eventType })
    }

    const result = await updateLogForMessageId(messageId, status, reason, eventAt)
    return ok(res, { processed: true, updated: result.updated, status })
  } catch (e) {
    console.error('email-delivery-status error:', e)
    return serverError(res, e.message || 'Failed')
  }
}

export default handler
