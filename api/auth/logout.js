import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { ok, badRequest } from '../_lib/response.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')

  const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
  const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
  const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''

  // Expire the refreshToken cookie
  res.setHeader('Set-Cookie', [
    `refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}${domainAttr}`
  ])

  return ok(res, { success: true })
}

export default withHttp(withLogging(handler))

import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    // Clear refresh token cookie
    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
    const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
    const cookieValue = `refreshToken=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}${domainAttr}`
    res.setHeader('Set-Cookie', [cookieValue])
    return ok(res, { message: 'Logged out successfully' })
  } catch (e) {
    return serverError(res, 'Logout failed', e.message)
  }
}

export default withHttp(withLogging(handler))
