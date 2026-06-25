import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

/**
 * @deprecated Use POST /api/auth/login — kept for backward compatibility with older scripts.
 */
async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  res.setHeader('Deprecation', 'true')
  res.setHeader('Link', '</api/auth/login>; rel="successor-version"')
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return badRequest(res, 'Email and password required')

    const normalizedEmail = String(email).trim().toLowerCase()
    const passwordString = String(password).replace(/\0/g, '').trim()

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) return unauthorized(res, 'Invalid credentials')
    if (user.status !== 'active') return unauthorized(res, 'Account is not active')

    const valid = await bcrypt.compare(passwordString, user.passwordHash)
    if (!valid) return unauthorized(res, 'Invalid credentials')

    const { signAccessToken, signRefreshToken, REFRESH_TOKEN_MAX_AGE_SECONDS } = await import('./_lib/jwt.js')
    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastSeenAt: new Date()
      }
    })

    const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true'
    const domain = process.env.REFRESH_COOKIE_DOMAIN || 'abcoafrica.co.za'
    const domainAttr = process.env.NODE_ENV === 'production' ? `; Domain=${domain}` : ''
    res.setHeader('Set-Cookie', [
      `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${REFRESH_TOKEN_MAX_AGE_SECONDS}${isSecure ? '; Secure' : ''}${domainAttr}`
    ])
    return ok(res, { accessToken })
  } catch (e) {
    return serverError(res, 'Login failed', e.message)
  }
}

export default withHttp(withLogging(handler))
