import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    // Clear refresh token cookie
    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const cookieValue = `refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', [cookieValue])
    return ok(res, { message: 'Logged out successfully' })
  } catch (e) {
    return serverError(res, 'Logout failed', e.message)
  }
}

export default withHttp(withLogging(handler))
