import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { ok, unauthorized, badRequest, serverError } from '../_lib/response.js'
import { verifyRefreshToken, signAccessToken } from '../_lib/jwt.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    const cookieHeader = req.headers['cookie'] || ''
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=')
      if (idx === -1) return [c.trim(), '']
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))]
    }))

    const refreshToken = cookies['refreshToken']
    if (!refreshToken) {
      return unauthorized(res, 'No refresh token')
    }

    const payload = verifyRefreshToken(refreshToken)
    if (!payload || !payload.sub) {
      return unauthorized(res, 'Invalid refresh token')
    }

    const accessToken = signAccessToken({ sub: payload.sub, email: payload.email, role: payload.role })
    return ok(res, { accessToken })
  } catch (e) {
    return serverError(res, 'Refresh failed', e.message)
  }
}

export default withHttp(withLogging(handler))