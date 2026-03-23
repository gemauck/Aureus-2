import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, handleGmailApiError } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  try {
    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    await gmail.users.getProfile({ userId: 'me' })
    const out = await gmail.users.labels.list({ userId: 'me' })
    const baseLabels = out.data.labels || []
    const labels = await Promise.all(
      baseLabels.map(async (l) => {
        try {
          const detail = await gmail.users.labels.get({ userId: 'me', id: l.id })
          const d = detail?.data || {}
          return {
            id: d.id || l.id,
            name: d.name || l.name,
            type: d.type || l.type,
            messagesTotal: Number.isFinite(Number(d.messagesTotal)) ? Number(d.messagesTotal) : 0,
            messagesUnread: Number.isFinite(Number(d.messagesUnread)) ? Number(d.messagesUnread) : 0
          }
        } catch (_) {
          return {
            id: l.id,
            name: l.name,
            type: l.type,
            messagesTotal: Number.isFinite(Number(l.messagesTotal)) ? Number(l.messagesTotal) : 0,
            messagesUnread: Number.isFinite(Number(l.messagesUnread)) ? Number(l.messagesUnread) : 0
          }
        }
      })
    )
    return ok(res, { labels })
  } catch (e) {
    console.error('erp-mail labels:', e)
    return handleGmailApiError(res, e, 'load Gmail labels')
  }
}

export default withHttp(withLogging(authRequired(handler)))
