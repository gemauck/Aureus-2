import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, parseGmailMessageData } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  const url = new URL(req.url, `http://${req.headers.host}`)
  const q = (url.searchParams.get('q') || '').trim()
  const pageToken = (url.searchParams.get('pageToken') || '').trim()
  const labelRaw = (url.searchParams.get('labelIds') || 'INBOX').trim()
  const maxResults = Math.min(Number(url.searchParams.get('maxResults') || 30), 100)
  const labelIds = labelRaw ? labelRaw.split(',').map((x) => x.trim()).filter(Boolean) : []

  try {
    const gmail = createGmailMailboxClient(req)
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: q || undefined,
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
    return serverError(res, 'Failed to load Gmail messages', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
