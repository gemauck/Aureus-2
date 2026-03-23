import { authRequired } from '../_lib/authRequired.js'
import { parseJsonBody } from '../_lib/body.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { buildRawMimeEmail, createGmailMailboxClient } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed')
  if (!(await requireErpCalendarAccess(req, res))) return

  try {
    const body = await parseJsonBody(req)
    const from = (body.from || process.env.HELPDESK_SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || '').trim()
    const to = (body.to || '').trim()
    const cc = (body.cc || '').trim()
    const bcc = (body.bcc || '').trim()
    const subject = (body.subject || '').trim()
    const textBody = body.textBody || ''
    const htmlBody = body.htmlBody || ''
    const threadId = (body.threadId || '').trim() || undefined

    if (!to) return badRequest(res, 'to is required')
    if (!from) return badRequest(res, 'from is required')

    const raw = buildRawMimeEmail({
      from,
      to,
      cc,
      bcc,
      subject,
      textBody,
      htmlBody,
      inReplyTo: body.inReplyTo || '',
      references: body.references || ''
    })

    const gmail = await createGmailMailboxClient(req, req.user?.sub)
    const sent = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId
      }
    })

    return ok(res, { id: sent.data.id, threadId: sent.data.threadId })
  } catch (e) {
    console.error('erp-mail send:', e)
    return handleGmailApiError(res, e, 'send Gmail message')
  }
}

export default withHttp(withLogging(authRequired(handler)))
