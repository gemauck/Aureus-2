import bcrypt from 'bcryptjs'
import { prisma } from '../../_lib/prisma.js'
import { signAccessToken, signRefreshToken } from '../../_lib/jwt.js'
import { badRequest, ok, serverError, unauthorized } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')

  try {
    let { email, password } = req.body || {}
    email = String(email || '').trim().toLowerCase()
    password = String(password || '').trim()

    if (!email || !password) return badRequest(res, 'Email and password required')
    if (!process.env.JWT_SECRET) return serverError(res, 'Server configuration error', 'JWT_SECRET missing')

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true, role: true, status: true, mustChangePassword: true }
    })

    if (!user || !user.passwordHash || user.status !== 'active') {
      return unauthorized(res, 'Invalid credentials')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return unauthorized(res, 'Invalid credentials')

    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name, platform: 'mobile' }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastSeenAt: new Date() }
    }).catch(() => null)

    return ok(res, {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      mustChangePassword: user.mustChangePassword || false
    })
  } catch (error) {
    return serverError(res, 'Mobile login failed', error?.message || 'Unknown error')
  }
}

export default withHttp(withLogging(handler))
