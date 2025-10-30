import { prisma } from '../_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    const { token, password } = req.body || {}
    if (!token || !password) return badRequest(res, 'Token and password are required')
    if (String(password).length < 8) return badRequest(res, 'Password must be at least 8 characters')

    const reset = await prisma.passwordReset.findUnique({ where: { token } })
    if (!reset) return badRequest(res, 'Invalid or expired token')
    if (reset.usedAt) return badRequest(res, 'Token already used')
    if (reset.expiresAt < new Date()) return badRequest(res, 'Token expired')

    const user = await prisma.user.findUnique({ where: { id: reset.userId } })
    if (!user || user.status !== 'active') return badRequest(res, 'Invalid user')

    const passwordHash = await bcrypt.hash(password, 10)

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
      prisma.passwordReset.update({ where: { token }, data: { usedAt: new Date() } })
    ])

    return ok(res, { message: 'Password has been reset successfully' })
  } catch (err) {
    console.error('reset-password error:', err)
    return serverError(res, 'Internal server error', err.message)
  }
}

export default withLogging(withHttp(handler))


