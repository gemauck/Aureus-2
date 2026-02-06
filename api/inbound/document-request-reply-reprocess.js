/**
 * POST /api/inbound/document-request-reply-reprocess
 * Secure reprocess endpoint for a received emailId (admin use).
 * Requires CRON_SECRET or RESEND_WEBHOOK_SECRET (query or x-cron-secret header).
 */
import { ok, badRequest, serverError } from '../_lib/response.js'
import { processReceivedEmail } from './document-request-reply.js'

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET || process.env.RESEND_WEBHOOK_SECRET
  const provided = (req.query && req.query.secret) || (req.headers && req.headers['x-cron-secret'])
  if (secret && provided !== secret) {
    return badRequest(res, 'Invalid or missing secret')
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const emailId = (body.emailId || body.id || (req.query && req.query.emailId) || '').toString().trim()
  const force = String(body.force ?? (req.query && req.query.force) ?? '') === '1'

  if (!emailId) {
    return badRequest(res, 'emailId is required')
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !apiKey.startsWith('re_')) {
    return badRequest(res, 'RESEND_API_KEY not set')
  }

  try {
    await processReceivedEmail(emailId, apiKey, body.data || body.payload?.data || {}, { force })
    return ok(res, { reprocessed: true, emailId, force })
  } catch (e) {
    console.error('document-request-reply-reprocess error:', e)
    return serverError(res, e.message || 'Failed to reprocess email')
  }
}

export default handler
