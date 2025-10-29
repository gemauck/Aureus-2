import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const pathSegments = req.url.split('/').filter(Boolean)
    
    // Parse query parameters safely
    const parseQueryParams = (urlString) => {
      const params = {}
      const queryIndex = urlString.indexOf('?')
      if (queryIndex === -1) return params
      
      const queryString = urlString.substring(queryIndex + 1)
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=')
        if (key) {
          params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : ''
        }
      })
      return params
    }

    const queryParams = parseQueryParams(req.url)

    // GET /api/feedback -> list feedback with optional filtering
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      try {
        const pageUrl = queryParams.pageUrl
        const section = queryParams.section
        const includeUser = queryParams.includeUser === 'true'

        const where = {}
        if (pageUrl) where.pageUrl = pageUrl
        if (section) where.section = section

        const selectFields = {
          id: true,
          userId: true,
          pageUrl: true,
          section: true,
          message: true,
          type: true,
          severity: true,
          meta: true,
          createdAt: true
        }

        if (includeUser) {
          selectFields.user = {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          }
        }

        const feedback = await prisma.feedback.findMany({
          where,
          select: selectFields,
          orderBy: { createdAt: 'desc' },
          take: pageUrl && section ? 50 : 200 // More results for specific sections
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


