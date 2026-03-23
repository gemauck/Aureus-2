import { google } from 'googleapis'
import { getAuthorizedCalendarClient } from './erpGoogleCalendar.js'
import { badRequest, serverError } from './response.js'

function requireEnv(name) {
  const v = (process.env[name] || '').trim()
  if (!v) {
    throw new Error(`Missing ${name} in server environment`)
  }
  return v
}

export async function createGmailMailboxClient(req, userId) {
  // Preferred mode: per-user OAuth connection already stored by ERP Calendar flow.
  if (userId) {
    const auth = await getAuthorizedCalendarClient(userId)
    if (auth?.oauth2) {
      return google.gmail({ version: 'v1', auth: auth.oauth2 })
    }
  }

  // Fallback mode: shared mailbox credentials from env.
  const clientId = requireEnv('GMAIL_CLIENT_ID')
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET')
  const refreshToken = requireEnv('GMAIL_REFRESH_TOKEN')
  const redirect =
    (process.env.GMAIL_REDIRECT_URI || '').trim() ||
    `${req.headers?.host?.includes('localhost') ? 'http' : 'https'}://${req.headers?.host}/api/helpdesk/gmail-callback`

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirect)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return google.gmail({ version: 'v1', auth: oauth2 })
}

function decodeBase64Url(input) {
  if (!input) return ''
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4
  const padded = normalized + (pad ? '='.repeat(4 - pad) : '')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function walkPartsForBody(part, out) {
  if (!part) return
  if (part.mimeType === 'text/plain' && part.body?.data && !out.text) {
    out.text = decodeBase64Url(part.body.data)
  }
  if (part.mimeType === 'text/html' && part.body?.data && !out.html) {
    out.html = decodeBase64Url(part.body.data)
  }
  if (Array.isArray(part.parts)) {
    part.parts.forEach((p) => walkPartsForBody(p, out))
  }
}

function collectAttachments(part, list) {
  if (!part) return
  if (part.filename && part.body?.attachmentId) {
    list.push({
      filename: part.filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: part.body.size || 0,
      attachmentId: part.body.attachmentId
    })
  }
  if (Array.isArray(part.parts)) {
    part.parts.forEach((p) => collectAttachments(p, list))
  }
}

function headerMap(headers = []) {
  const out = {}
  headers.forEach((h) => {
    const k = (h.name || '').toLowerCase()
    if (k) out[k] = h.value || ''
  })
  return out
}

export function parseGmailMessageData(messageData) {
  const payload = messageData?.payload || {}
  const headers = headerMap(payload.headers || [])
  const bodyOut = { text: '', html: '' }

  if (payload.body?.data) {
    bodyOut.text = decodeBase64Url(payload.body.data)
  } else {
    walkPartsForBody(payload, bodyOut)
  }

  const attachments = []
  collectAttachments(payload, attachments)

  return {
    id: messageData?.id,
    threadId: messageData?.threadId,
    snippet: messageData?.snippet || '',
    labelIds: messageData?.labelIds || [],
    internalDate: messageData?.internalDate || null,
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    bcc: headers.bcc || '',
    subject: headers.subject || '(No subject)',
    messageId: headers['message-id'] || '',
    references: headers.references || '',
    inReplyTo: headers['in-reply-to'] || '',
    date: headers.date || '',
    bodyText: bodyOut.text || '',
    bodyHtml: bodyOut.html || '',
    attachments
  }
}

function encodeBase64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function buildRawMimeEmail({
  from,
  to,
  cc,
  bcc,
  subject,
  textBody,
  htmlBody,
  attachments,
  inReplyTo,
  references
}) {
  const lines = []
  lines.push(`From: ${from}`)
  lines.push(`To: ${to}`)
  if (cc) lines.push(`Cc: ${cc}`)
  if (bcc) lines.push(`Bcc: ${bcc}`)
  lines.push(`Subject: ${subject || ''}`)
  lines.push('MIME-Version: 1.0')
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`)
  if (references) lines.push(`References: ${references}`)

  const files = Array.isArray(attachments) ? attachments.filter(Boolean) : []
  if (files.length) {
    const mixedBoundary = `abco-mixed-${Date.now().toString(16)}`
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    lines.push('')
    lines.push(`--${mixedBoundary}`)
    if (htmlBody) {
      const altBoundary = `abco-alt-${Date.now().toString(16)}`
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
      lines.push('')
      lines.push(`--${altBoundary}`)
      lines.push('Content-Type: text/plain; charset=UTF-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(textBody || '')
      lines.push(`--${altBoundary}`)
      lines.push('Content-Type: text/html; charset=UTF-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(htmlBody)
      lines.push(`--${altBoundary}--`)
    } else {
      lines.push('Content-Type: text/plain; charset=UTF-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(textBody || '')
    }

    files.forEach((file) => {
      const mimeType = String(file.mimeType || 'application/octet-stream')
      const filename = String(file.filename || 'attachment')
      const b64 = String(file.contentBase64 || '')
        .replace(/\r?\n/g, '')
        .trim()
      if (!b64) return
      lines.push(`--${mixedBoundary}`)
      lines.push(`Content-Type: ${mimeType}; name="${filename}"`)
      lines.push('Content-Transfer-Encoding: base64')
      lines.push(`Content-Disposition: attachment; filename="${filename}"`)
      lines.push('')
      for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76))
    })
    lines.push(`--${mixedBoundary}--`)
  } else if (htmlBody) {
    const boundary = `abco-${Date.now().toString(16)}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: 7bit')
    lines.push('')
    lines.push(textBody || '')
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: 7bit')
    lines.push('')
    lines.push(htmlBody)
    lines.push(`--${boundary}--`)
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('Content-Transfer-Encoding: 7bit')
    lines.push('')
    lines.push(textBody || '')
  }

  return encodeBase64Url(lines.join('\r\n'))
}

export function handleGmailApiError(res, error, actionLabel = 'perform Gmail action') {
  const status = error?.response?.status
  const wwwAuth = String(error?.response?.headers?.['www-authenticate'] || '')
  const message = error?.response?.data?.error?.message || error?.message || 'Gmail API request failed'

  // Most common production issue: token exists but missing Gmail scopes.
  if (status === 403 && /insufficient_scope/i.test(wwwAuth)) {
    return badRequest(
      res,
      `Cannot ${actionLabel}: Google account is connected without Gmail permissions.`,
      'Reconnect Google in ERP Calendar (Disconnect -> Connect) to grant Gmail scopes, then retry.'
    )
  }
  if (status === 401) {
    return badRequest(
      res,
      `Cannot ${actionLabel}: Google authorization expired or invalid.`,
      'Reconnect Google in ERP Calendar and try again.'
    )
  }
  if (status === 403 && /gmail api has not been used|disabled/i.test(message)) {
    return badRequest(
      res,
      `Cannot ${actionLabel}: Gmail API is disabled in the connected Google project.`,
      'Enable Gmail API in Google Cloud Console for this OAuth client project, wait 1-5 minutes, then reconnect Google in ERP.'
    )
  }
  return serverError(res, `Failed to ${actionLabel}`, message)
}
