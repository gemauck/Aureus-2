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

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return unauthorized(res, 'User not found')

    const newPayload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(newPayload)
    const newRefreshToken = signRefreshToken(newPayload)

    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const cookieValue = `refreshToken=${newRefreshToken}; HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', [cookieValue])
    return ok(res, { data: { accessToken } })
  } catch (e) {
    return serverError(res, 'Refresh failed', e.message)
  }
}

export default withHttp(withLogging(handler))