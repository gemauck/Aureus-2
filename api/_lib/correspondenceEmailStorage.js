/**
 * Persist project correspondence emails and attachments on the server (uploads/project-correspondence).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveSafeUploadDir } from './securityGuards.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '../..')
const UPLOAD_FOLDER = 'project-correspondence'
const RESEND_API_BASE = 'https://api.resend.com'
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024

function uploadDir(subfolder = '') {
  const uploadRoot = path.join(ROOT_DIR, 'uploads')
  const folder = subfolder ? `${UPLOAD_FOLDER}/${subfolder}` : UPLOAD_FOLDER
  const resolved = resolveSafeUploadDir(uploadRoot, folder)
  if (!resolved) throw new Error('Invalid upload folder')
  fs.mkdirSync(resolved.targetDir, { recursive: true })
  return resolved
}

function publicPath(safeFolder, fileName) {
  return `/uploads/${safeFolder}/${fileName}`
}

function writeBuffer(buffer, fileName, subfolder = '') {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large: ${buffer.length} bytes`)
  }
  const { targetDir, safeFolder } = uploadDir(subfolder)
  const filePath = path.join(targetDir, fileName)
  fs.writeFileSync(filePath, buffer)
  return publicPath(safeFolder, fileName)
}

async function resendApi(method, apiPath, apiKey) {
  return fetch(`${RESEND_API_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })
}

export async function fetchResendReceivedEmail(emailId, apiKey) {
  const res = await resendApi('GET', `/emails/receiving/${emailId}`, apiKey)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend get received email failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function downloadBytes(url, apiKey) {
  const attempts = [
    { headers: {} },
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Abcotronics-ERP/1.0)', Accept: '*/*' } },
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: '*/*' } }
  ]
  let lastError
  for (const opts of attempts) {
    try {
      const res = await fetch(url, { method: 'GET', ...opts })
      if (!res.ok) {
        lastError = new Error(`Download ${res.status}`)
        continue
      }
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('Download failed')
}

async function getAttachmentList(emailId, apiKey, webhookAttachments, emailObject) {
  for (const attempt of [1, 2]) {
    const res = await resendApi('GET', `/emails/receiving/${emailId}/attachments`, apiKey)
    if (res.ok) {
      const data = await res.json()
      let list = data.data != null ? data.data : (Array.isArray(data) ? data : [])
      if (!Array.isArray(list)) list = []
      if (list.length > 0) return list
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 2000))
  }
  if (Array.isArray(webhookAttachments) && webhookAttachments.length > 0) return webhookAttachments
  if (emailObject && Array.isArray(emailObject.attachments) && emailObject.attachments.length > 0) {
    return emailObject.attachments
  }
  return []
}

async function getAttachmentMeta(emailId, attachmentId, apiKey) {
  const res = await resendApi('GET', `/emails/receiving/${emailId}/attachments/${attachmentId}`, apiKey)
  if (!res.ok) throw new Error(`Attachment meta ${res.status}`)
  return res.json()
}

async function getAttachmentContentFromApi(emailId, attachmentId, apiKey) {
  const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}/attachments/${attachmentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/octet-stream,*/*'
    }
  })
  if (!res.ok) return null
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length > 0 ? buf : null
}

/**
 * Download all inbound attachments and save under uploads/project-correspondence/.
 */
export async function saveReceivedAttachments(emailId, apiKey, webhookAttachments = null, emailObject = null) {
  const saved = []
  const list = await getAttachmentList(emailId, apiKey, webhookAttachments, emailObject)
  if (list.length === 0) return saved

  for (const att of list) {
    const fileName = att?.filename || att?.name || `attachment-${att?.id || 'file'}`
    let downloadUrl = att?.download_url || att?.downloadUrl
    if (!downloadUrl && att?.id) {
      try {
        const meta = await getAttachmentMeta(emailId, att.id, apiKey)
        downloadUrl = meta?.download_url || meta?.downloadUrl
      } catch (e) {
        console.warn('correspondenceEmailStorage: attachment meta failed', att.id, e?.message)
      }
    }

    let buffer = null
    if (downloadUrl) {
      try {
        buffer = await downloadBytes(downloadUrl, apiKey)
      } catch (e) {
        console.warn('correspondenceEmailStorage: CDN download failed', fileName, e?.message)
      }
    }
    if (!buffer && att?.id) {
      try {
        buffer = await getAttachmentContentFromApi(emailId, att.id, apiKey)
      } catch (e) {
        console.warn('correspondenceEmailStorage: API content failed', att.id, e?.message)
      }
    }
    if (!buffer) continue

    try {
      const ext = path.extname(fileName) || ''
      const safeBase = path.basename(fileName, ext).replace(/[^a-z0-9._-]/gi, '_').slice(0, 80)
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const storedName = `recv-${emailId.slice(0, 12)}-${unique}-${safeBase || 'file'}${ext}`
      const filePath = writeBuffer(buffer, storedName, 'attachments')
      saved.push({
        fileName,
        filePath,
        mimeType: att?.content_type || att?.contentType || null,
        size: buffer.length
      })
    } catch (e) {
      console.warn('correspondenceEmailStorage: save attachment failed', fileName, e?.message)
    }
  }

  return saved
}

function sanitizeEmailForArchive(email) {
  if (!email || typeof email !== 'object') return {}
  return {
    id: email.id || email.email_id || null,
    from: email.from || null,
    to: email.to || null,
    cc: email.cc || email.ccs || null,
    subject: email.subject || null,
    text: typeof email.text === 'string' ? email.text.slice(0, 200000) : null,
    html: typeof email.html === 'string' ? email.html.slice(0, 500000) : null,
    headers: email.headers || null,
    created_at: email.created_at || email.createdAt || null,
    message_id: email.message_id || email.messageId || null
  }
}

/**
 * Save received email as JSON (+ optional raw .eml) on the server.
 */
export async function saveReceivedEmailArchive(emailId, email, apiKey, attachmentPaths = []) {
  let rawEmailPath = null
  const rawUrl = email?.raw?.download_url || email?.raw?.downloadUrl
  if (rawUrl) {
    try {
      const emlBuf = await downloadBytes(rawUrl, apiKey)
      if (emlBuf.length <= MAX_ARCHIVE_BYTES) {
        rawEmailPath = writeBuffer(emlBuf, `recv-${emailId}.eml`, 'emails')
      }
    } catch (e) {
      console.warn('correspondenceEmailStorage: raw .eml save failed', emailId, e?.message)
    }
  }

  const archive = {
    kind: 'received',
    emailId,
    savedAt: new Date().toISOString(),
    rawEmailPath,
    attachments: attachmentPaths,
    email: sanitizeEmailForArchive(email)
  }
  const jsonBuf = Buffer.from(JSON.stringify(archive, null, 2), 'utf8')
  const emailArchivePath = writeBuffer(jsonBuf, `recv-${emailId}.json`, 'emails')
  return { emailArchivePath, rawEmailPath }
}

/**
 * Save outbound sent email content + attachment refs to the server.
 */
export function saveSentEmailArchive({
  entryId,
  subject,
  fromEmail,
  to,
  cc,
  text,
  html,
  messageId,
  attachments = []
}) {
  const archive = {
    kind: 'sent',
    entryId,
    savedAt: new Date().toISOString(),
    messageId: messageId || null,
    fromEmail: fromEmail || null,
    to: to || [],
    cc: cc || [],
    subject: subject || '',
    text: text || '',
    html: html || null,
    attachments: (attachments || []).map((a) => ({
      fileName: a.fileName || a.name,
      filePath: a.filePath || a.url,
      mimeType: a.mimeType || null,
      size: a.size != null ? a.size : null
    }))
  }
  const jsonBuf = Buffer.from(JSON.stringify(archive, null, 2), 'utf8')
  if (jsonBuf.length > MAX_ARCHIVE_BYTES) {
    archive.html = archive.html ? '[truncated]' : null
    archive.text = (archive.text || '').slice(0, 200000)
  }
  const finalBuf = Buffer.from(JSON.stringify(archive, null, 2), 'utf8')
  const emailArchivePath = writeBuffer(finalBuf, `sent-${entryId}.json`, 'emails')
  return { emailArchivePath, rawEmailPath: null }
}
