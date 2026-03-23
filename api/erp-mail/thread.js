import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, handleGmailApiError, parseGmailMessageData } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  const url = new URL(req.url, `http://${req.headers.host}`)
  const id = (url.searchParams.get('id') || '').trim()
  if (!id) return badRequest(res, 'id query parameter is required')

  try {
    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    const out = await gmail.users.threads.get({
      userId: 'me',
      id,
      format: 'full'
    })
    const messages = (out.data.messages || []).map((m) => parseGmailMessageData(m))
    return ok(res, { threadId: id, messages, historyId: out.data.historyId || null })
  } catch (e) {
    console.error('erp-mail thread:', e)
    return handleGmailApiError(res, e, 'load Gmail thread')
  }
}

export default withHttp(withLogging(authRequired(handler)))
