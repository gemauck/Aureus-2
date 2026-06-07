// Register Expo push tokens for mobile ERP notifications
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    const userId = req.user?.sub || req.user?.id
    if (!userId) return badRequest(res, 'Authentication required')

    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const token = String(body.token || '').trim()
      const platform = String(body.platform || 'expo').trim()
      if (!token) return badRequest(res, 'token is required')

      const row = await prisma.pushDeviceToken.upsert({
        where: { token },
        create: { userId, token, platform },
        update: { userId, platform, updatedAt: new Date() }
      })
      return ok(res, { id: row.id })
    }

    if (req.method === 'DELETE') {
      const body = await parseJsonBody(req).catch(() => ({}))
      const token = String(body.token || req.query?.token || '').trim()
      if (token) {
        await prisma.pushDeviceToken.deleteMany({ where: { userId, token } })
      } else {
        await prisma.pushDeviceToken.deleteMany({ where: { userId } })
      }
      return ok(res, { removed: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('Push register error:', error)
    return serverError(res, 'Push registration failed', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
