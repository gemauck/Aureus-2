/**
 * POST /api/inbound/document-request-reply
 * Resend email.received webhook: when a reply is received at the document-request inbound
 * address, look up the original sent message (In-Reply-To → DocumentRequestEmailSent),
 * download attachments, upload to uploads/doc-collection-comments, and create a
 * DocumentItemComment for that project/document/month.
 *
 * Resend setup: In Resend Dashboard enable "Receive" for your domain, then add a webhook
 * for event "email.received" pointing to: https://your-domain/api/inbound/document-request-reply
 * No auth - webhook is validated by Resend/Svix signing when RESEND_WEBHOOK_SECRET is set.
 *
 * When DocumentRequestEmailSent has requesterEmail:
 * - A copy of the reply is forwarded to that address (documents@ is not a real mailbox).
 * - An in-app notification is created so the requester sees "Document request reply received" when they log in.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest, serverError } from '../_lib/response.js'

const UPLOAD_FOLDER = 'doc-collection-comments'
// Default to enabled; allow explicit opt-out by setting to "false".
const ENABLE_RECEIVED_EMAIL_COMMENTS =
  String(process.env.DOC_COLLECTION_RECEIVED_COMMENT_ENABLED || 'true').toLowerCase() !== 'false'
// 24h tolerance so Resend Replay works (replays send original timestamp); override via RESEND_WEBHOOK_TOLERANCE_SEC
const SIGNATURE_TOLERANCE_SEC = parseInt(process.env.RESEND_WEBHOOK_TOLERANCE_SEC || '86400', 10) || 86400

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function isValidEmail(s) {
  return typeof s === 'string' && s.trim().length > 0 && EMAIL_RE.test(s.trim())
}

/** Verify Resend/Svix webhook signature (raw body + svix-id, svix-timestamp, svix-signature). */
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
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25MB per file

function normalizeMessageId(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/^<|>$/g, '').trim()
}

/** Normalize headers to a plain object with lowercase keys for consistent lookup. */
function normalizeHeaders(headers) {
  if (!headers) return {}
  if (Array.isArray(headers)) {
    const out = {}
    for (const h of headers) {
      if (h && typeof h === 'object') {
        const k = (h.name || h.key || h.headerName || '').toLowerCase().trim()
        const v = h.value ?? h.val ?? h.headerValue ?? ''
        if (k) out[k] = String(v)
      }
    }
    return out
  }
  if (typeof headers === 'object' && !Array.isArray(headers)) {
    const out = {}
    for (const [k, v] of Object.entries(headers)) {
      if (k && v != null) out[k.toLowerCase()] = String(v)
    }
    return out
  }
  return {}
}

function getInReplyTo(headers) {
  const h = normalizeHeaders(headers)
  let raw = h['in-reply-to'] || h['in_reply_to']
  if (raw) return normalizeMessageId(raw)
  if (typeof headers === 'string') {
    const match = headers.match(/in-reply-to:\s*([^\r\n]+)/i)
    if (match) return normalizeMessageId(match[1].trim())
  }
  return null
}

/** Get first message ID from References header (fallback when In-Reply-To missing). */
function getFirstReference(headers) {
  const h = normalizeHeaders(headers)
  let raw = h['references']
  if (raw && typeof raw === 'string') {
    const first = raw.trim().split(/\s+/)[0]
    return first ? normalizeMessageId(first) : null
  }
  if (typeof headers === 'string') {
    const match = headers.match(/references:\s*([^\r\n]+)/i)
    if (match) {
      const first = match[1].trim().split(/\s+/)[0]
      return first ? normalizeMessageId(first) : null
    }
  }
  return null
}

/** Parse In-Reply-To and References from raw .eml text (headers section). */
function parseInReplyToFromRaw(rawText) {
  if (!rawText || typeof rawText !== 'string') return null
  const m = rawText.match(/in-reply-to:\s*([^\r\n]+)/i)
  if (m && m[1]) return normalizeMessageId(m[1].trim())
  const ref = rawText.match(/references:\s*([^\r\n]+)/i)
  if (ref && ref[1]) {
    const first = ref[1].trim().split(/\s+/)[0]
    if (first) return normalizeMessageId(first)
  }
  return null
}

/** Extract ALL message IDs from In-Reply-To and References (raw .eml). Resend often uses its own format in In-Reply-To; our docreq-xxx@domain may appear in References. */
function parseAllMessageIdsFromRaw(rawText) {
  if (!rawText || typeof rawText !== 'string') return []
  const ids = new Set()
  const add = (val) => {
    const n = normalizeMessageId(val)
    if (n && n.length > 5) ids.add(n)
  }
  const m = rawText.match(/in-reply-to:\s*([^\r\n]+)/i)
  if (m && m[1]) {
    const parts = m[1].trim().split(/\s+/)
    parts.forEach(add)
  }
  const ref = rawText.match(/references:\s*([^\r\n]+)/i)
  if (ref && ref[1]) {
    ref[1].trim().split(/\s+/).forEach(add)
  }
  return [...ids]
}

/** Get all candidate message IDs from email (In-Reply-To + References). Try each when matching; Resend may put our docreq-xxx in References while In-Reply-To uses their format. */
async function getAllMessageIdCandidates(email, fetchRawUrl, apiKey) {
  const candidates = new Set()
  const add = (val) => {
    const n = val && typeof val === 'string' ? normalizeMessageId(val) : ''
    if (n && n.length > 5) candidates.add(n)
  }
  const headers = email.headers || {}
  const h = normalizeHeaders(headers)
  const inReplyTo = h['in-reply-to'] || h['in_reply_to'] || email.in_reply_to
  if (inReplyTo && typeof inReplyTo === 'string') {
    inReplyTo.trim().split(/\s+/).forEach(add)
  }
  const refs = h['references'] || email.references
  if (refs && typeof refs === 'string') {
    refs.trim().split(/\s+/).forEach(add)
  }
  if (fetchRawUrl) {
    try {
      const opts = { method: 'GET' }
      if (apiKey) opts.headers = { Authorization: `Bearer ${apiKey}` }
      const res = await fetch(fetchRawUrl, opts)
      if (res.ok) {
        const raw = await res.text()
        const fromRaw = parseAllMessageIdsFromRaw(raw)
        fromRaw.forEach((id) => candidates.add(id))
      }
    } catch (err) {
      console.warn('document-request-reply: failed to fetch raw for candidates', err.message)
    }
  }
  const text = (email.text || '').toString() + '\n' + (email.html || '').toString()
  const inReplyMatch = text.match(/in-reply-to:\s*([^\r\n]+)/gi)
  if (inReplyMatch) inReplyMatch.forEach((s) => add(s.replace(/in-reply-to:\s*/i, '').trim()))
  const msgIdMatch = text.match(/message-id:\s*([^\r\n]+)/gi)
  if (msgIdMatch) msgIdMatch.forEach((s) => add(s.replace(/message-id:\s*/i, '').trim()))
  return [...candidates]
}

/** Extract In-Reply-To from full email object. Resend often omits In-Reply-To from JSON headers; use raw .eml first. */
async function getInReplyToFromEmail(email, fetchRawUrl, apiKey) {
  const headers = email.headers || {}
  let inReplyTo = getInReplyTo(headers) || getFirstReference(headers)
  if (inReplyTo) return inReplyTo
  // Resend API may return top-level (e.g. in_reply_to)
  if (email.in_reply_to && typeof email.in_reply_to === 'string') return normalizeMessageId(email.in_reply_to)
  if (email.references && typeof email.references === 'string') {
    const first = email.references.trim().split(/\s+/)[0]
    if (first) return normalizeMessageId(first)
  }
  // Resend JSON often omits In-Reply-To in headers; fetch raw .eml (primary for replies)
  if (fetchRawUrl) {
    try {
      const opts = { method: 'GET' }
      if (apiKey) opts.headers = { Authorization: `Bearer ${apiKey}` }
      const res = await fetch(fetchRawUrl, opts)
      if (res.ok) {
        const raw = await res.text()
        inReplyTo = parseInReplyToFromRaw(raw)
        if (inReplyTo) {
          console.log('document-request-reply: in_reply_to from raw .eml', inReplyTo.slice(0, 60))
          return inReplyTo
        }
      } else if (apiKey && res.status === 403) {
        console.warn('document-request-reply: raw .eml fetch 403, In-Reply-To may be in body only')
      }
    } catch (err) {
      console.warn('document-request-reply: failed to fetch raw email for In-Reply-To', err.message)
    }
  }
  // Fallback: parse from body (quoted original may contain Message-ID or In-Reply-To)
  const text = (email.text || '').toString() + '\n' + (email.html || '').toString()
  const match = text.match(/in-reply-to:\s*([^\r\n]+)/gi)
  if (match && match[0]) {
    const val = match[0].replace(/in-reply-to:\s*/i, '').trim()
    if (val) return normalizeMessageId(val)
  }
  const msgIdMatch = text.match(/message-id:\s*([^\r\n]+)/gi)
  if (msgIdMatch && msgIdMatch[0]) {
    const val = msgIdMatch[0].replace(/message-id:\s*/i, '').trim()
    if (val) return normalizeMessageId(val)
  }
  return null
}

/** Extract plain text from email (text or html). */
function emailBodyText(email) {
  const text = email.text
  if (text && typeof text === 'string' && text.trim()) return text.trim().slice(0, 4000)
  const html = email.html
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
      .slice(0, 4000)
    if (stripped) return stripped
  }
  return ''
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

const RESEND_API_BASE = 'https://api.resend.com'

/** Resend API request with Bearer token. */
async function resendApi(method, pathname, apiKey, options = {}) {
  const url = pathname.startsWith('http') ? pathname : `${RESEND_API_BASE}${pathname}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${pathname} failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return res
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Create an in-app notification for the requester so they see "Document request reply received" when they log in.
 * Non-blocking; errors are logged only.
 */
async function notifyRequesterInApp(requesterEmail, projectId, documentId, year, month) {
  if (!requesterEmail || !isValidEmail(requesterEmail) || !projectId || !documentId) return
  try {
    const user = await prisma.user.findUnique({
      where: { email: requesterEmail.trim().toLowerCase() },
      select: { id: true }
    })
    if (!user) return
    let docName = 'Document'
    try {
      const doc = await prisma.documentItem.findUnique({
        where: { id: documentId },
        select: { name: true }
      })
      if (doc?.name) docName = doc.name
    } catch (_) {}
    const monthName = month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : String(month)
    const title = 'Document request reply received'
    const message = `${docName} – ${monthName} ${year}. Reply received via email.`
    const link = `#/projects/${projectId}?tab=documentCollection`
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'system',
        title,
        message,
        link,
        metadata: JSON.stringify({ projectId, documentId, year, month, source: 'document-request-reply' })
      }
    })
    console.log('document-request-reply: in-app notification created for requester', requesterEmail.trim())
  } catch (err) {
    console.warn('document-request-reply: in-app notification error', err.message)
  }
}

/**
 * Forward a copy of the received reply to the requester (documents@ is not a real mailbox).
 * Uses Resend Send API; non-blocking, errors are logged only.
 */
async function forwardReplyToRequester(apiKey, email, requesterEmail, attachmentCount) {
  const inboundEmail = process.env.DOCUMENT_REQUEST_INBOUND_EMAIL || process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS || ''
  if (!inboundEmail || !isValidEmail(inboundEmail) || !isValidEmail(requesterEmail)) return
  const subject = (email.subject || '').toString().trim() || '(no subject)'
  const fwdSubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`
  const origHtml = (email.html || '').toString().trim()
  const origText = (email.text || '').toString().trim()
  const intro = 'This document request reply was received at documents@ and forwarded to you as the requester.'
  const attachmentNote = attachmentCount > 0 ? ` This reply included ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}.` : ''
  const html = `<p>${intro}${attachmentNote}</p><hr/><p><strong>From:</strong> ${(email.from || '').toString()}</p><p><strong>Subject:</strong> ${fwdSubject}</p><hr/>${origHtml || `<pre>${(origText || '').replace(/</g, '&lt;')}</pre>`}`
  const text = `${intro}${attachmentNote}\n\nFrom: ${(email.from || '').toString()}\nSubject: ${fwdSubject}\n\n---\n\n${origText || origHtml.replace(/<[^>]+>/g, '')}`
  const payload = {
    from: `Abcotronics Documents <${inboundEmail}>`,
    to: [requesterEmail.trim()],
    subject: `Fwd: ${fwdSubject}`,
    html,
    text
  }
  try {
    const res = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const t = await res.text()
      console.warn('document-request-reply: forward to requester failed', res.status, t.slice(0, 200))
      return
    }
    console.log('document-request-reply: forwarded reply to requester', requesterEmail.trim())
  } catch (err) {
    console.warn('document-request-reply: forward to requester error', err.message)
  }
}

/**
 * Get list of attachments for a received email.
 * Uses List Attachments API; falls back to webhook payload data.attachments or email.attachments.
 * Retries list once after 2s if empty (eventual consistency).
 */
async function getAttachmentList(emailId, apiKey, webhookAttachments = null, emailObject = null) {
  for (const attempt of [1, 2]) {
    const res = await resendApi('GET', `/emails/receiving/${emailId}/attachments`, apiKey)
    const data = await res.json()
    let list = data.data != null ? data.data : (Array.isArray(data) ? data : [])
    if (!Array.isArray(list)) list = []
    if (list.length > 0) return list
    if (attempt === 1) {
      console.log('document-request-reply: list attachments empty, retry in 2s', { emailId })
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  // Fallback: webhook payload data.attachments (has id, filename; no download_url)
  if (webhookAttachments && Array.isArray(webhookAttachments) && webhookAttachments.length > 0) {
    return webhookAttachments
  }
  if (emailObject && Array.isArray(emailObject.attachments) && emailObject.attachments.length > 0) {
    return emailObject.attachments
  }
  return []
}

/**
 * Get a single attachment's metadata (includes download_url).
 * Use when list item has id but no download_url.
 */
async function getAttachmentMeta(emailId, attachmentId, apiKey) {
  const res = await resendApi('GET', `/emails/receiving/${emailId}/attachments/${attachmentId}`, apiKey)
  return res.json()
}

/**
 * Fetch attachment bytes directly from Resend API (fallback when CDN download_url fails).
 * Tries Accept: application/octet-stream; if API returns JSON (metadata), returns null.
 */
async function getAttachmentContentFromApi(emailId, attachmentId, apiKey) {
  const url = `${RESEND_API_BASE}/emails/receiving/${emailId}/attachments/${attachmentId}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/octet-stream,*/*'
    }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend attachment content ${res.status}: ${text.slice(0, 150)}`)
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Download attachment bytes from Resend's download_url (signed CDN URL).
 * Tries: (1) no custom headers, (2) browser-like User-Agent, (3) with API key.
 */
async function downloadAttachmentBytes(downloadUrl, apiKey) {
  const attempts = [
    { headers: {} },
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Abcotronics-ERP/1.0)',
        Accept: '*/*'
      }
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (compatible; Abcotronics-ERP/1.0)',
        Accept: '*/*'
      }
    }
  ]
  let lastError
  for (const opts of attempts) {
    try {
      const res = await fetch(downloadUrl, { method: 'GET', ...opts })
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200)
        lastError = new Error(`Download ${res.status}: ${text}`)
        continue
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      return buffer
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/**
 * Save buffer to uploads/doc-collection-comments and return public path.
 */
function saveAttachmentToUploads(buffer, filename, dirname) {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment too large: ${buffer.length} bytes (max ${MAX_ATTACHMENT_BYTES})`)
  }
  const rootDir = path.resolve(dirname, '..', '..')
  const targetDir = path.join(rootDir, 'uploads', UPLOAD_FOLDER)
  fs.mkdirSync(targetDir, { recursive: true })
  const ext = path.extname(filename) || ''
  const base = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fileName = `${base || 'file'}-${unique}${ext}`
  const filePath = path.join(targetDir, fileName)
  fs.writeFileSync(filePath, buffer)
  return `/uploads/${UPLOAD_FOLDER}/${fileName}`
}

/**
 * Pull all attachments from Resend for a received email and save to uploads.
 * Uses webhook payload attachments (id, filename) when list API returns empty; fetches download_url per attachment.
 * Returns array of { name, url } for each saved file.
 */
async function pullAttachmentsFromResendAndSave(emailId, apiKey, webhookAttachments, emailObject, dirname) {
  const list = await getAttachmentList(emailId, apiKey, webhookAttachments, emailObject)
  if (list.length === 0) {
    console.log('document-request-reply: no attachments for email', emailId)
    return []
  }
  console.log('document-request-reply: attachment list', { emailId, count: list.length, firstKeys: list[0] ? Object.keys(list[0]) : [] })
  const uploaded = []
  for (const att of list) {
    const name = att.filename || att.name || 'attachment'
    let downloadUrl = att.download_url || att.downloadUrl
    if (!downloadUrl && att.id) {
      try {
        const meta = await getAttachmentMeta(emailId, att.id, apiKey)
        downloadUrl = meta.download_url || meta.downloadUrl
      } catch (e) {
        console.warn('document-request-reply: get attachment meta failed', att.id, e.message)
        continue
      }
    }
    if (!downloadUrl) {
      console.warn('document-request-reply: no download_url for attachment', { name, attKeys: Object.keys(att) })
      continue
    }
    let buffer
    try {
      buffer = await downloadAttachmentBytes(downloadUrl, apiKey)
    } catch (err) {
      if (att.id) {
        try {
          buffer = await getAttachmentContentFromApi(emailId, att.id, apiKey)
        } catch (e) {
          console.warn('document-request-reply: API fallback failed', att.id, e.message)
        }
      }
      if (!buffer) {
        console.warn('document-request-reply: attachment save failed', name, err.message)
        continue
      }
    }
    try {
      const publicUrl = saveAttachmentToUploads(buffer, name, dirname)
      uploaded.push({ name, url: publicUrl })
      console.log('document-request-reply: attachment saved', name, publicUrl)
    } catch (err) {
      console.warn('document-request-reply: save to uploads failed', name, err.message)
    }
  }
  return uploaded
}

async function handler(req, res) {
  // Allow OPTIONS (CORS preflight) and GET (reachability check)
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(204).end()
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      endpoint: 'Resend email.received webhook',
      method: 'POST',
      hint: 'In Resend Dashboard add a webhook for event "email.received" with this URL (change to your domain).'
    })
  }
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'GET, POST, OPTIONS').json({ error: 'Method not allowed' })
  }

  // Log every POST immediately so we can confirm webhook is being called
  console.log('document-request-reply: POST received', { contentType: req.headers?.['content-type'] || 'none' })

  try {
    const rawBody = typeof req.body === 'string' ? req.body : (req.body ? JSON.stringify(req.body) : '{}')
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || process.env.WEBHOOK_SIGNING_SECRET
    if (webhookSecret) {
      if (!verifyWebhookSignature(rawBody, req.headers || {}, webhookSecret)) {
        console.warn('document-request-reply: invalid webhook signature (401)')
        return res.status(401).json({ error: 'Invalid webhook signature' })
      }
    }
    let body
    try {
      body = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body) ? req.body : JSON.parse(rawBody)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
    const data = body.data || body.payload?.data || body
    const emailId =
      (data && (data.email_id || data.emailId || data.id)) ||
      body.email_id ||
      body.emailId ||
      body.id ||
      null
    const eventType = body.type || body.event_type || (data && (data.type || data.event_type))
    if (eventType !== 'email.received') {
      console.warn('document-request-reply: ignored event (expected email.received)', { receivedType: eventType, bodyKeys: Object.keys(body) })
      return ok(res, { processed: false, reason: 'not_email_received', receivedType: eventType })
    }
    if (!data || !emailId) {
      console.warn('document-request-reply: missing data.email_id', {
        bodyKeys: Object.keys(body),
        dataKeys: data ? Object.keys(data) : []
      })
      return ok(res, { processed: false, reason: 'missing_email_id' })
    }

    console.log('document-request-reply: webhook received', { type: body.type || body.event_type, email_id: emailId })
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey || !apiKey.startsWith('re_')) {
      console.warn('document-request-reply: RESEND_API_KEY not set, skipping')
      return ok(res, { processed: false, reason: 'no_resend_api_key' })
    }

    // Prepare payload before sending response so we never throw after res is sent
    let dataCopy
    try {
      dataCopy = data ? JSON.parse(JSON.stringify(data)) : {}
    } catch (e) {
      console.warn('document-request-reply: clone payload failed', e.message)
      dataCopy = {}
    }

    // Respond immediately to avoid Resend timeout (10–30s); process in background
    res.status(200).json({ received: true, processing: 'async' })

    setImmediate(() => {
      Promise.resolve()
        .then(() => processReceivedEmail(emailId, apiKey, dataCopy))
        .catch((e) => console.error('document-request-reply: background error', e))
    })
    return
  } catch (e) {
    console.error('POST /api/inbound/document-request-reply error:', e)
    return serverError(res, e.message || 'Failed to process document request reply')
  }
}

async function processReceivedEmail(emailId, apiKey, data) {
  try {
    console.log('document-request-reply: processing', { emailId })
    const email = await fetchReceivedEmail(emailId, apiKey)
    console.log('document-request-reply: fetched email', { subject: (email.subject || '').toString().slice(0, 100) })
    const rawUrl = email.raw && (email.raw.download_url || email.raw.downloadUrl)
    const allCandidates = await getAllMessageIdCandidates(email, rawUrl, apiKey)
    if (allCandidates.length === 0) {
      console.log('document-request-reply: no In-Reply-To/References, will try subject fallback', { emailId, subject: (email.subject || '').toString().slice(0, 80) })
    }

    let mapping = null
    // Try message-ID matching when we have candidates.
    if (allCandidates.length > 0) {
      const messageIdCandidates = new Set(allCandidates)
      allCandidates.forEach((c) => {
        const lp = c.split('@')[0]
        if (lp && lp.startsWith('docreq-')) messageIdCandidates.add(lp)
      })
      const candidatesArray = [...messageIdCandidates]
      mapping = await prisma.documentRequestEmailSent.findFirst({
        where: { messageId: { in: candidatesArray } }
      })
      if (!mapping) {
        const recent = await prisma.documentRequestEmailSent.findMany({
          take: 300,
          orderBy: { createdAt: 'desc' }
        })
        for (const cand of candidatesArray) {
          const lp = cand.split('@')[0]
          mapping =
            recent.find(
              (r) =>
                r.messageId === cand ||
                r.messageId === lp ||
                cand.startsWith(r.messageId) ||
                (r.messageId.length >= 10 && cand.includes(r.messageId))
            ) || null
          if (mapping) break
        }
      }
      if (!mapping) {
        for (const cand of candidatesArray) {
          const lp = cand.split('@')[0]
          if (lp && lp.startsWith('docreq-')) {
            const byLocalPart = await prisma.documentRequestEmailSent.findFirst({
              where: { messageId: { startsWith: lp + '@' } }
            })
            if (byLocalPart) {
              mapping = byLocalPart
              break
            }
          }
        }
      }
    }
    // Fallback: match by subject (e.g. "Re: ... - CIPC Documents - February 2026"). Works even when In-Reply-To is missing.
    // Reply subject is often "Re: Abco Document / Data request: ProjectName - DocumentName - February 2026".
    // Use the LAST " - Month Year" so we get DocumentName (segment before it), not ProjectName.
    if (!mapping) {
      const subject = (email.subject || '').toString()
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      let fallbackMonth = null
      let fallbackYear = null
      let docNameFromSubject = null
      const dash = '[\\s\\u002D\\u2013\\u2014]+'
      let lastMatchIndex = -1
      for (let i = 0; i < monthNames.length; i++) {
        const re = new RegExp(`${dash}([^\\u002D\\u2013\\u2014]+)${dash}${monthNames[i]}\\s+(20\\d{2})\\b`, 'gi')
        let m
        while ((m = re.exec(subject)) !== null) {
          if (m.index > lastMatchIndex) {
            lastMatchIndex = m.index
            docNameFromSubject = m[1].trim()
            fallbackMonth = i + 1
            fallbackYear = parseInt(m[2], 10)
          }
        }
      }
      if (!fallbackMonth || !fallbackYear) {
        const abbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        for (let i = 0; i < monthNames.length; i++) {
          const re = new RegExp(`\\b${monthNames[i]}\\s+(20\\d{2})\\b`, 'i')
          const m = re.exec(subject)
          if (m && m[1]) {
            fallbackMonth = i + 1
            fallbackYear = parseInt(m[1], 10)
            break
          }
          const reAbbr = new RegExp(`\\b${abbr[i]}\\w*\\s+(20\\d{2})\\b`, 'i')
          const mAbbr = reAbbr.exec(subject)
          if (mAbbr && mAbbr[1]) {
            fallbackMonth = i + 1
            fallbackYear = parseInt(mAbbr[1], 10)
            break
          }
        }
      }
      let subjectFallbackDocIds = []
      let subjectFallbackProjectIds = []
      if (fallbackMonth && fallbackYear) {
        let whereClause = { month: fallbackMonth, year: fallbackYear }
        const cleanDocName = docNameFromSubject ? docNameFromSubject.replace(/\s+/g, ' ').trim() : null
        if (cleanDocName && cleanDocName.length > 1) {
          const recentProjects = await prisma.documentRequestEmailSent.findMany({
            where: { month: fallbackMonth, year: fallbackYear },
            select: { projectId: true },
            distinct: ['projectId'],
            take: 20
          })
          const projectIds = recentProjects.map((p) => p.projectId)
          subjectFallbackProjectIds = projectIds
          let docsWithName = await prisma.documentItem.findMany({
            where: {
              name: { equals: cleanDocName, mode: 'insensitive' },
              section: { projectId: { in: projectIds } }
            },
            select: { id: true }
          })
          if (docsWithName.length === 0 && projectIds.length > 0) {
            docsWithName = await prisma.documentItem.findMany({
              where: {
                name: { contains: cleanDocName, mode: 'insensitive' },
                section: { projectId: { in: projectIds } }
              },
              select: { id: true }
            })
          }
          const matchingDocIds = docsWithName.map((d) => d.id)
          subjectFallbackDocIds = matchingDocIds
          if (matchingDocIds.length > 0) {
            whereClause = { ...whereClause, documentId: { in: matchingDocIds } }
          }
          console.log('document-request-reply: subject fallback lookup', { fallbackMonth, fallbackYear, cleanDocName, projectCount: projectIds.length, matchingDocIds: matchingDocIds.length })
        }
        mapping = await prisma.documentRequestEmailSent.findFirst({
          where: whereClause,
          orderBy: { createdAt: 'desc' }
        })
        if (mapping) {
          console.log('document-request-reply: matched by subject fallback', { documentId: mapping.documentId, month: fallbackMonth, year: fallbackYear, docName: cleanDocName || 'any' })
        } else if (subjectFallbackDocIds.length > 0 && subjectFallbackProjectIds.length > 0) {
          // No DocumentRequestEmailSent row for this doc+month+year (e.g. send log succeeded but reply routing row failed). Still attach reply to the document we matched by name.
          mapping = {
            documentId: subjectFallbackDocIds[0],
            projectId: subjectFallbackProjectIds[0],
            year: fallbackYear,
            month: fallbackMonth,
            sectionId: null,
            messageId: ''
          }
          console.log('document-request-reply: matched by subject fallback (no sent row)', { documentId: mapping.documentId, month: fallbackMonth, year: fallbackYear })
        }
      }
      if (!mapping && (email.subject || '').toString().length > 0) {
        console.warn('document-request-reply: subject fallback did not find mapping', { subject: (email.subject || '').toString().slice(0, 120) })
      }
    }
    if (!mapping) {
      const primaryId = allCandidates[0] || ''
      console.warn('document-request-reply: unknown_thread', {
        candidatesCount: allCandidates.length,
        firstCandidate: primaryId.slice(0, 80),
        tried: allCandidates.slice(0, 10),
        recentCount: (await prisma.documentRequestEmailSent.count()).toString(),
        subject: (email.subject || '').slice(0, 80),
        hint: 'Send a new document request from the app, then reply to that email. Resend may use a different In-Reply-To format.'
      })
      return
    }

    console.log('document-request-reply: matched thread', {
      projectId: mapping.projectId,
      itemId: mapping.documentId,
      year: mapping.year,
      month: mapping.month,
      messageId: mapping.messageId.slice(0, 60)
    })

    const { projectId, sectionId, documentId: itemId, year, month } = mapping
    const bodyText = emailBodyText(email)
    const fromStr = (email.from || '').toString().replace(/^.*<([^>]+)>.*$/, '$1').trim() || 'unknown'

    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const webhookAttachments = data.attachments && Array.isArray(data.attachments) ? data.attachments : null
    const receivedAttachmentCount = Array.isArray(webhookAttachments)
      ? webhookAttachments.length
      : Array.isArray(email?.attachments)
        ? email.attachments.length
        : 0
    let uploaded = []
    if (ENABLE_RECEIVED_EMAIL_COMMENTS) {
      uploaded = await pullAttachmentsFromResendAndSave(emailId, apiKey, webhookAttachments, email, __dirname)
      console.log('document-request-reply: attachments', { emailId, savedCount: uploaded.length })

      const attachmentLine =
        uploaded.length > 0
          ? `Attachments: ${uploaded.map((u) => u.name).join(', ')}`
          : 'No attachments'
      const commentText = [
        'Email from Client',
        fromStr !== 'unknown' ? ` (${fromStr})` : '',
        bodyText ? `\n\n${bodyText}\n\n${attachmentLine}` : `\n\n${attachmentLine}`
      ]
        .join('')
        .trim()

      await prisma.documentItemComment.create({
        data: {
          itemId,
          year,
          month,
          text: commentText,
          author: 'Email from Client',
          authorId: null,
          attachments: JSON.stringify(uploaded)
        }
      })

      console.log('document-request-reply: comment created', { projectId, itemId, year, month, attachmentsAdded: uploaded.length })
    } else {
      console.log('document-request-reply: received comment creation disabled', { projectId, itemId, year, month })
    }

    // Forward a copy to the requester (documents@ is not a real mailbox) and notify in-app
    const requesterEmail = mapping.requesterEmail
    if (requesterEmail && isValidEmail(requesterEmail)) {
      const attachmentCount = ENABLE_RECEIVED_EMAIL_COMMENTS ? uploaded.length : receivedAttachmentCount
      forwardReplyToRequester(apiKey, email, requesterEmail, attachmentCount).catch((e) =>
        console.warn('document-request-reply: forward to requester', e.message)
      )
      notifyRequesterInApp(requesterEmail, projectId, itemId, year, month).catch((e) =>
        console.warn('document-request-reply: in-app notify', e.message)
      )
    }
  } catch (e) {
    console.error('document-request-reply: background process error', e)
  }
}

export default handler
