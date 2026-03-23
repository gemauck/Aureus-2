import { authRequired } from '../_lib/authRequired.js'
import { parseJsonBody } from '../_lib/body.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  try {
    const body = await parseJsonBody(req)
    const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []
    if (!ids.length) return badRequest(res, 'id or ids is required')
    const gmail = createGmailMailboxClient(req)
    await Promise.all(ids.map((id) => gmail.users.messages.trash({ userId: 'me', id })))
    return ok(res, { trashed: ids.length })
  } catch (e) {
    console.error('erp-mail trash:', e)
    return serverError(res, 'Failed to trash Gmail message', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
