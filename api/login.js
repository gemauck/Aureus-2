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

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return unauthorized(res)

    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    res.setHeader('Set-Cookie', [
      `refreshToken=${refreshToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` // 7 days
    ])
    return ok(res, { accessToken })
  } catch (e) {
    return serverError(res, 'Login failed', e.message)
  }
}

export default withHttp(withLogging(handler))