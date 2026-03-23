import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { createGmailMailboxClient, handleGmailApiError } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  const url = new URL(req.url, `http://${req.headers.host}`)
  const messageId = (url.searchParams.get('messageId') || '').trim()
  const attachmentId = (url.searchParams.get('attachmentId') || '').trim()
  const filename = (url.searchParams.get('filename') || '').trim()
  const mimeType = (url.searchParams.get('mimeType') || '').trim() || 'application/octet-stream'
  if (!messageId || !attachmentId) return badRequest(res, 'messageId and attachmentId are required')

  try {
    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    const out = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId
    })
    return ok(res, {
      filename: filename || 'attachment',
      mimeType,
      attachmentId,
      messageId,
      dataBase64: out.data?.data || ''
    })
  } catch (e) {
    console.error('erp-mail attachment:', e)
    return handleGmailApiError(res, e, 'load Gmail attachment')
  }
}

export default withHttp(withLogging(authRequired(handler)))
