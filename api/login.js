import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { signAccessToken, signRefreshToken } from './_lib/jwt.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    // Use Express's built-in JSON parser instead of manual parsing
    const { email, password } = req.body || {}
    if (!email || !password) return badRequest(res, 'Email and password required')

    console.log('🔐 Login attempt:', email)
    const user = await prisma.user.findUnique({ where: { email } })
    console.log('🔐 User found:', !!user, user ? `has passwordHash: ${!!user.passwordHash}` : 'N/A')
    if (!user || !user.passwordHash) return unauthorized(res)

    console.log('🔐 Comparing password...')
    const valid = await bcrypt.compare(password, user.passwordHash)
    console.log('🔐 Password valid:', valid)
    if (!valid) return unauthorized(res)
    
    console.log('✅ Login successful for:', email)

    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    // Update last login and last seen timestamps
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
      `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${isSecure ? '; Secure' : ''}${domainAttr}` // 7 days
    ])
    return ok(res, { accessToken })
  } catch (e) {
    return serverError(res, 'Login failed', e.message)
  }
}

export default withHttp(withLogging(handler))