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

function getInReplyTo(headers) {
  if (!headers || typeof headers !== 'object') return null
  const raw =
    headers['in-reply-to'] ||
    headers['In-Reply-To'] ||
    headers.inReplyTo
  return raw ? normalizeMessageId(raw) : null
}

/** Get first message ID from References header (fallback when In-Reply-To missing). */
function getFirstReference(headers) {
  if (!headers || typeof headers !== 'object') return null
  const raw =
    headers['references'] ||
    headers['References'] ||
    headers.references
  if (!raw || typeof raw !== 'string') return null
  const first = raw.trim().split(/\s+/)[0]
  return first ? normalizeMessageId(first) : null
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
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey || !apiKey.startsWith('re_')) {
      console.warn('document-request-reply: RESEND_API_KEY not set, skipping')
      return ok(res, { processed: false, reason: 'no_resend_api_key' })
    }

    const email = await fetchReceivedEmail(emailId, apiKey)
    const headers = email.headers || {}
    const inReplyTo = getInReplyTo(headers) || getFirstReference(headers)
    if (!inReplyTo) {
      return ok(res, { processed: false, reason: 'no_in_reply_to_or_references' })
    }

    const messageIdCandidates = [inReplyTo, inReplyTo.split('@')[0]].filter(Boolean)
    const mapping = await prisma.documentRequestEmailSent.findFirst({
      where: {
        messageId: { in: messageIdCandidates }
      }
    })
    if (!mapping) {
      return ok(res, { processed: false, reason: 'unknown_thread', inReplyTo: inReplyTo.slice(0, 50) })
    }

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
