/**
 * POST /api/inbound/document-request-reply
 * Resend email.received webhook: when a reply is received at the document-request inbound
 * address, look up the original sent message (In-Reply-To → DocumentRequestEmailSent),
 * download attachments, upload to uploads/doc-collection-comments, and append to the
 * latest DocumentItemComment for that project/section/document/month (or create one).
 * No auth - webhook is validated by Resend/Svix signing when RESEND_WEBHOOK_SECRET is set.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest, serverError } from '../_lib/response.js'

const UPLOAD_FOLDER = 'doc-collection-comments'
const SIGNATURE_TOLERANCE_SEC = 300 // 5 minutes

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

/** Extract In-Reply-To from full email object. Resend often omits In-Reply-To from JSON headers; use raw .eml first. */
async function getInReplyToFromEmail(email, fetchRawUrl) {
  const headers = email.headers || {}
  let inReplyTo = getInReplyTo(headers) || getFirstReference(headers)
  if (inReplyTo) return inReplyTo
  if (email.in_reply_to && typeof email.in_reply_to === 'string') return normalizeMessageId(email.in_reply_to)
  if (email.references && typeof email.references === 'string') {
    const first = email.references.trim().split(/\s+/)[0]
    if (first) return normalizeMessageId(first)
  }
  // Resend JSON often does not include In-Reply-To in headers; fetch raw .eml (primary for replies)
  if (fetchRawUrl) {
    try {
      const res = await fetch(fetchRawUrl, { method: 'GET' })
      if (res.ok) {
        const raw = await res.text()
        inReplyTo = parseInReplyToFromRaw(raw)
        if (inReplyTo) {
          console.log('document-request-reply: in_reply_to from raw .eml', inReplyTo.slice(0, 60))
          return inReplyTo
        }
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

async function listReceivedAttachments(emailId, apiKey) {
  const res = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend list attachments failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  const list = data.data != null ? data.data : (Array.isArray(data) ? data : [])
  return list
}

function safeFilename(name) {
  const base = path.basename((name || 'attachment').toString())
  return base.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120)
}

async function downloadAndSaveAttachment(downloadUrl, filename, __dirname) {
  const res = await fetch(downloadUrl, { method: 'GET' })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_ATTACHMENT_BYTES)
    throw new Error(`Attachment too large: ${buffer.length} bytes`)
  const rootDir = path.resolve(__dirname, '..', '..')
  const uploadRoot = path.join(rootDir, 'uploads')
  const targetDir = path.join(uploadRoot, UPLOAD_FOLDER)
  fs.mkdirSync(targetDir, { recursive: true })
  const ext = path.extname(filename) || ''
  const base = path.basename(filename, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fileName = `${base || 'file'}-${unique}${ext}`
  const filePath = path.join(targetDir, fileName)
  fs.writeFileSync(filePath, buffer)
  return `/uploads/${UPLOAD_FOLDER}/${fileName}`
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
    if (body.type !== 'email.received' || !body.data || !body.data.email_id) {
      return ok(res, { processed: false, reason: 'not_email_received' })
    }

    const emailId = body.data.email_id
    console.log('document-request-reply: webhook received', { type: body.type, email_id: emailId })
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey || !apiKey.startsWith('re_')) {
      console.warn('document-request-reply: RESEND_API_KEY not set, skipping')
      return ok(res, { processed: false, reason: 'no_resend_api_key' })
    }

    const email = await fetchReceivedEmail(emailId, apiKey)
    const rawUrl = email.raw && (email.raw.download_url || email.raw.downloadUrl)
    const inReplyTo = await getInReplyToFromEmail(email, rawUrl)
    if (!inReplyTo) {
      const headerKeys = email.headers ? Object.keys(normalizeHeaders(email.headers)) : []
      const hasRaw = !!(email.raw && (email.raw.download_url || email.raw.downloadUrl))
      console.warn('document-request-reply: no In-Reply-To', {
        emailId,
        headerKeys,
        hasRawUrl: hasRaw,
        in_reply_to: email.in_reply_to || null,
        references: email.references ? (typeof email.references === 'string' ? email.references.slice(0, 80) : 'present') : null
      })
      return ok(res, { processed: false, reason: 'no_in_reply_to_or_references' })
    }

    // Stored messageId is without angle brackets (e.g. docreq-uuid@domain). In-Reply-To is normalized the same way.
    const localPart = inReplyTo.split('@')[0]
    const messageIdCandidates = [inReplyTo, localPart].filter(Boolean)
    let mapping = await prisma.documentRequestEmailSent.findFirst({
      where: { messageId: { in: messageIdCandidates } }
    })
    if (!mapping) {
      const recent = await prisma.documentRequestEmailSent.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' }
      })
      mapping = recent.find(
        (r) =>
          r.messageId === inReplyTo ||
          r.messageId === localPart ||
          inReplyTo.startsWith(r.messageId) ||
          (r.messageId.length >= 10 && inReplyTo.includes(r.messageId))
      ) || null
    }
    if (!mapping) {
      console.warn('document-request-reply: unknown_thread', {
        inReplyTo: inReplyTo.slice(0, 120),
        localPart,
        tried: messageIdCandidates,
        hint: 'Send a NEW document request from the app (after deploy), then reply to that email. Old requests used Resend internal id.'
      })
      return ok(res, {
        processed: false,
        reason: 'unknown_thread',
        inReplyTo: inReplyTo.slice(0, 120),
        hint: 'Send a new document request from the app, then reply to that email. Old requests may not match.'
      })
    }

    console.log('document-request-reply: matched thread', {
      projectId: mapping.projectId,
      itemId: mapping.documentId,
      year: mapping.year,
      month: mapping.month,
      inReplyTo: inReplyTo.slice(0, 60)
    })

    const { projectId, sectionId, documentId: itemId, year, month } = mapping
    const bodyText = emailBodyText(email)
    const fromStr = (email.from || '').toString().replace(/^.*<([^>]+)>.*$/, '$1').trim() || 'unknown'

    const attachmentsList = await listReceivedAttachments(emailId, apiKey)
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const uploaded = []

    for (const att of attachmentsList) {
      const url = att.download_url || att.downloadUrl
      const name = att.filename || att.name || 'attachment'
      if (!url) continue
      try {
        const publicUrl = await downloadAndSaveAttachment(url, name, __dirname)
        uploaded.push({ name, url: publicUrl })
      } catch (err) {
        console.warn('document-request-reply: failed to save attachment', name, err.message)
      }
    }

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

    return ok(res, {
      processed: true,
      projectId,
      itemId,
      year,
      month,
      attachmentsAdded: uploaded.length,
      commentCreated: true
    })
  } catch (e) {
    console.error('POST /api/inbound/document-request-reply error:', e)
    return serverError(res, e.message || 'Failed to process document request reply')
  }
}

export default handler
