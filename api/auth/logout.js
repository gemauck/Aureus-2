import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    // Clear refresh token cookie
    res.setHeader('Set-Cookie', [
      `refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`]
    )
    return ok(res, { message: 'Logged out successfully' })
  } catch (e) {
    return serverError(res, 'Logout failed', e.message)
  }
}

export default withHttp(withLogging(handler))
