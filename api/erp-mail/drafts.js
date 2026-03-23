import { authRequired } from '../_lib/authRequired.js'
import { parseJsonBody } from '../_lib/body.js'
import { badRequest, ok } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'
import { buildRawMimeEmail, createGmailMailboxClient, handleGmailApiError, parseGmailMessageData } from '../_lib/gmailMailboxClient.js'

async function handler(req, res) {
  if (!(await requireErpCalendarAccess(req, res))) return
  const gmail = await createGmailMailboxClient(req, req.user?.sub)

  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const id = (url.searchParams.get('id') || '').trim()
    const maxResults = Math.min(Number(url.searchParams.get('maxResults') || 20), 100)
    const pageToken = (url.searchParams.get('pageToken') || '').trim() || undefined
    try {
      if (id) {
        const out = await gmail.users.drafts.get({ userId: 'me', id, format: 'full' })
        const msg = out.data?.message ? parseGmailMessageData(out.data.message) : null
        return ok(res, { draft: out.data, message: msg })
      }
      const out = await gmail.users.drafts.list({ userId: 'me', maxResults, pageToken })
      return ok(res, {
        drafts: out.data?.drafts || [],
        nextPageToken: out.data?.nextPageToken || null,
        resultSizeEstimate: out.data?.resultSizeEstimate || 0
      })
    } catch (e) {
      console.error('erp-mail drafts GET:', e)
      return handleGmailApiError(res, e, 'load Gmail drafts')
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const action = (body.action || 'save').trim()
      if (action === 'send') {
        const id = (body.id || '').trim()
        if (!id) return badRequest(res, 'id is required for send action')
        const out = await gmail.users.drafts.send({ userId: 'me', requestBody: { id } })
        return ok(res, { id: out.data?.id, threadId: out.data?.threadId })
      }

      const from = (body.from || process.env.HELPDESK_SUPPORT_EMAIL || process.env.SMTP_FROM_EMAIL || '').trim()
      const to = (body.to || '').trim()
      const cc = (body.cc || '').trim()
      const bcc = (body.bcc || '').trim()
      const subject = (body.subject || '').trim()
      const textBody = body.textBody || ''
      const htmlBody = body.htmlBody || ''
      const threadId = (body.threadId || '').trim() || undefined
      const attachments = Array.isArray(body.attachments) ? body.attachments : []
      const id = (body.id || '').trim()
      if (!from) return badRequest(res, 'from is required')

      const raw = buildRawMimeEmail({
        from,
        to,
        cc,
        bcc,
        subject,
        textBody,
        htmlBody,
        attachments,
        inReplyTo: body.inReplyTo || '',
        references: body.references || ''
      })

      const requestBody = { message: { raw, threadId } }
      if (id) {
        const out = await gmail.users.drafts.update({ userId: 'me', id, requestBody })
        return ok(res, { draft: out.data })
      }
      const out = await gmail.users.drafts.create({ userId: 'me', requestBody })
      return ok(res, { draft: out.data })
    } catch (e) {
      console.error('erp-mail drafts POST:', e)
      return handleGmailApiError(res, e, 'save Gmail draft')
    }
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
