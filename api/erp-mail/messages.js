import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, handleGmailApiError, parseGmailMessageData } from '../_lib/gmailMailboxClient.js'

function quoteQueryValue(v) {
  return `"${String(v || '').replace(/"/g, '\\"')}"`
}

function buildSearchQuery({ q, from, subject, hasAttachment, after, before }) {
  const parts = []
  const text = String(q || '').trim()
  if (text) parts.push(text)
  if (from) parts.push(`from:${quoteQueryValue(from)}`)
  if (subject) parts.push(`subject:${quoteQueryValue(subject)}`)
  if (hasAttachment === '1' || hasAttachment === 'true') parts.push('has:attachment')
  if (after) parts.push(`after:${after}`)
  if (before) parts.push(`before:${before}`)
  return parts.join(' ').trim()
}

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  const url = new URL(req.url, `http://${req.headers.host}`)
  const q = (url.searchParams.get('q') || '').trim()
  const from = (url.searchParams.get('from') || '').trim()
  const subject = (url.searchParams.get('subject') || '').trim()
  const hasAttachment = (url.searchParams.get('hasAttachment') || '').trim()
  const after = (url.searchParams.get('after') || '').trim()
  const before = (url.searchParams.get('before') || '').trim()
  const pageToken = (url.searchParams.get('pageToken') || '').trim()
  const labelRaw = (url.searchParams.get('labelIds') || 'INBOX').trim()
  const maxResults = Math.min(Number(url.searchParams.get('maxResults') || 30), 100)
  const labelIds = labelRaw ? labelRaw.split(',').map((x) => x.trim()).filter(Boolean) : []
  const query = buildSearchQuery({ q, from, subject, hasAttachment, after, before })

  try {
    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query || undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      maxResults,
      pageToken: pageToken || undefined,
      includeSpamTrash: false
    })

    const refs = list.data.messages || []
    const messages = await Promise.all(
      refs.map(async (m) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Message-ID', 'References', 'In-Reply-To']
        })
        return parseGmailMessageData(msg.data)
      })
    )

    return ok(res, {
      messages,
      nextPageToken: list.data.nextPageToken || null,
      resultSizeEstimate: list.data.resultSizeEstimate || 0
    })
  } catch (e) {
    console.error('erp-mail messages:', e)
    return handleGmailApiError(res, e, 'load Gmail messages')
  }
}

export default withHttp(withLogging(authRequired(handler)))
