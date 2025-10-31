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
