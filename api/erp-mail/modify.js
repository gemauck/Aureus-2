import { authRequired } from '../_lib/authRequired.js'
import { parseJsonBody } from '../_lib/body.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, handleGmailApiError } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  try {
    const body = await parseJsonBody(req)
    const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []
    const addLabelIds = Array.isArray(body.addLabelIds) ? body.addLabelIds : []
    const removeLabelIds = Array.isArray(body.removeLabelIds) ? body.removeLabelIds : []
    if (!ids.length) return badRequest(res, 'id or ids is required')

    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    await Promise.all(
      ids.map((id) =>
        gmail.users.messages.modify({
          userId: 'me',
          id,
          requestBody: { addLabelIds, removeLabelIds }
        })
      )
    )
    return ok(res, { updated: ids.length })
  } catch (e) {
    console.error('erp-mail modify:', e)
    return handleGmailApiError(res, e, 'modify Gmail message')
  }
}

export default withHttp(withLogging(authRequired(handler)))
