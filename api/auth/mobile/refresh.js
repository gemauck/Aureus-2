import { prisma } from '../../_lib/prisma.js'
import {
  isMobileEmbedTokenPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../_lib/jwt.js'
import { badRequest, ok, serverError, unauthorized } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')

  try {
    const refreshToken = String(req.body?.refreshToken || '').trim()
    if (!refreshToken) return unauthorized(res, 'No refresh token')
    if (!process.env.JWT_SECRET) return serverError(res, 'Server configuration error', 'JWT_SECRET missing')

    const payload = verifyRefreshToken(refreshToken)
    if (!payload || !payload.sub) return unauthorized(res, 'Invalid refresh token')
    if (isMobileEmbedTokenPayload(payload)) return unauthorized(res, 'Invalid refresh token')

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        permissions: true
      }
    })

    if (!user || user.status !== 'active') return unauthorized(res, 'Invalid refresh token')

    const nextPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      platform: 'mobile'
    }
    const accessToken = signAccessToken(nextPayload)
    const rotatedRefreshToken = signRefreshToken(nextPayload)

    return ok(res, {
      accessToken,
      refreshToken: rotatedRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions || '[]'
      }
    })
  } catch (error) {
    return serverError(res, 'Mobile refresh failed', error?.message || 'Unknown error')
  }
}

export default withHttp(withLogging(handler))
