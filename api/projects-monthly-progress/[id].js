import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'PUT' && req.method !== 'PATCH') {
      return badRequest(res, 'Method not allowed')
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const id = req.params?.id || pathSegments[pathSegments.length - 1]

    if (!id) {
      return badRequest(res, 'Project ID required')
    }

    let body = req.body

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (parseError) {
        console.error('❌ Failed to parse string body for monthly progress update:', parseError)
        body = {}
      }
    }

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      body = await parseJsonBody(req)
    }

    body = body || {}

    if (body.monthlyProgress === undefined || body.monthlyProgress === null) {
      return badRequest(res, 'monthlyProgress field is required')
    }

    try {
      let monthlyProgressString = body.monthlyProgress

      if (typeof monthlyProgressString === 'string') {
        const parsed = JSON.parse(monthlyProgressString)
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          throw new Error('monthlyProgress must be an object')
        }

        const validFields = ['compliance', 'data', 'comments']
        for (const key in parsed) {
          if (typeof parsed[key] !== 'object' || Array.isArray(parsed[key]) || parsed[key] === null) {
            console.warn(`⚠️ Invalid month data structure for key: ${key}`)
          } else {
            for (const field in parsed[key]) {
              if (validFields.includes(field) && typeof parsed[key][field] !== 'string') {
                parsed[key][field] = String(parsed[key][field] || '')
              }
            }
          }
        }

        monthlyProgressString = JSON.stringify(parsed)
      } else {
        if (typeof monthlyProgressString !== 'object' || Array.isArray(monthlyProgressString)) {
          throw new Error('monthlyProgress must be an object')
        }
        monthlyProgressString = JSON.stringify(monthlyProgressString)
      }

      const project = await prisma.project.update({
        where: { id },
        data: { monthlyProgress: monthlyProgressString }
      })


      return ok(res, { project })
    } catch (error) {
      console.error('❌ Invalid monthlyProgress data (projects-monthly-progress):', error)
      return serverError(
        res,
        'Invalid monthlyProgress format. Must be valid JSON object.',
        error.message
      )
    }
  } catch (error) {
    console.error('❌ projects-monthly-progress [id] API Error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))


