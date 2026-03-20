import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../_lib/jwt.js'
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

    const nextPayload = { sub: payload.sub, email: payload.email, role: payload.role, name: payload.name, platform: 'mobile' }
    const accessToken = signAccessToken(nextPayload)
    const rotatedRefreshToken = signRefreshToken(nextPayload)

    return ok(res, {
      accessToken,
      refreshToken: rotatedRefreshToken
    })
  } catch (error) {
    return serverError(res, 'Mobile refresh failed', error?.message || 'Unknown error')
  }
}

export default withHttp(withLogging(handler))
