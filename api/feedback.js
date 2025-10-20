import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const pathSegments = req.url.split('/').filter(Boolean)

    // GET /api/feedback -> list latest feedback (admin only soon; for now allow authenticated)
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      try {
        const feedback = await prisma.feedback.findMany({
          orderBy: { createdAt: 'desc' },
          take: 200
        })
        return ok(res, feedback)
      } catch (e) {
        return serverError(res, 'Failed to fetch feedback', e.message)
      }
    }

    // POST /api/feedback -> create
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      const body = await parseJsonBody(req)
      const message = (body.message || '').trim()
      const pageUrl = (body.pageUrl || '').trim()
      const section = (body.section || '').trim()

      if (!message) return badRequest(res, 'message required')
      if (!pageUrl) return badRequest(res, 'pageUrl required')

      const record = {
        userId: req.user?.sub || null,
        pageUrl,
        section,
        message,
        type: body.type || 'feedback',
        severity: body.severity || 'medium',
        meta: body.meta || null
      }

      try {
        const createdItem = await prisma.feedback.create({ data: record })
        return created(res, createdItem)
      } catch (e) {
        return serverError(res, 'Failed to create feedback', e.message)
      }
    }

    return badRequest(res, 'Invalid feedback request')
  } catch (e) {
    return serverError(res, 'Feedback handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))


