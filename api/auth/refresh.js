import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) return unauthorized(res, 'No refresh token')

    const payload = verifyRefreshToken(refreshToken)
    if (!payload) return unauthorized(res, 'Invalid refresh token')

    // Development-only shortcut: avoid DB lookup locally
    if (process.env.DEV_LOCAL_NO_DB === 'true') {
      const newPayload = { sub: payload.sub || 'dev-admin', email: payload.email || 'admin@example.com', role: payload.role || 'admin' }
      const accessToken = signAccessToken(newPayload)
      const newRefreshToken = signRefreshToken(newPayload)
      const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
      const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
      const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
      const cookieValue = `refreshToken=${newRefreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${domainAttr}`
      res.setHeader('Set-Cookie', [cookieValue])
      return ok(res, { data: { accessToken } })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return unauthorized(res, 'User not found')

    const newPayload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(newPayload)
    const newRefreshToken = signRefreshToken(newPayload)

    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
    const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
    const cookieValue = `refreshToken=${newRefreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}${domainAttr}`
    res.setHeader('Set-Cookie', [cookieValue])
    return ok(res, { data: { accessToken } })
  } catch (e) {
    return serverError(res, 'Refresh failed', e.message)
  }
}

export default withHttp(withLogging(handler))