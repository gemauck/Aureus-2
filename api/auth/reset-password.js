import { prisma } from '../_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  if (!prisma.passwordReset || typeof prisma.passwordReset.findUnique !== 'function') {
    console.error('reset-password: Prisma client missing passwordReset model. Run npx prisma generate on the server.')
    if (!res.headersSent) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: {
            code: 'PASSWORD_RESET_UNAVAILABLE',
            message: 'Password reset is temporarily unavailable. Please contact your administrator.'
          }
        })
      )
    }
    return
  }
  let lastStep = 'start'
  try {
    const body = req.body
    if (body === undefined || body === null) {
      console.error('reset-password: req.body missing (middleware order?)')
      return badRequest(res, 'Invalid request. Please try again.')
    }
    const { token, password } = body || {}
    const tokenTrimmed = typeof token === 'string' ? token.trim() : ''
    if (!tokenTrimmed || !password) return badRequest(res, 'Token and password are required')
    if (String(password).length < 8) return badRequest(res, 'Password must be at least 8 characters')

    lastStep = 'findUnique(passwordReset)'
    const reset = await prisma.passwordReset.findUnique({ where: { token: tokenTrimmed } })
    if (!reset) return badRequest(res, 'Invalid or expired token')
    if (reset.usedAt) return badRequest(res, 'Token already used')
    if (reset.expiresAt < new Date()) return badRequest(res, 'Token expired')

    lastStep = 'findUnique(user)'
    const user = await prisma.user.findUnique({ where: { id: reset.userId } })
    if (!user || user.status !== 'active') return badRequest(res, 'Invalid user')

    lastStep = 'bcrypt.hash'
    const passwordHash = await bcrypt.hash(password, 10)

    lastStep = 'transaction(user.update, passwordReset.update)'
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
      prisma.passwordReset.update({ where: { token: tokenTrimmed }, data: { usedAt: new Date() } })
    ])

    return ok(res, { message: 'Password has been reset successfully' })
  } catch (err) {
    console.error('reset-password failed at step:', lastStep)
    console.error('reset-password error:', err?.message || err)
    console.error('reset-password error code:', err?.code)
    if (err?.meta) console.error('reset-password error meta:', err.meta)
    if (err?.stack) console.error('reset-password stack:', err.stack)
    if (res.headersSent) return
    const code = err?.code
    const msg = String(err?.message || '')
    const isPrismaClientMissing =
      /is not a function|Cannot read propert(y|ies).*of undefined|passwordReset.*undefined/i.test(msg)
    if (isPrismaClientMissing) {
      console.error('reset-password: Prisma client may be missing passwordReset model or findUnique. Run npx prisma generate on the server.')
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: {
            code: 'PASSWORD_RESET_UNAVAILABLE',
            message: 'Password reset is temporarily unavailable. Please contact your administrator.'
          }
        })
      )
      return
    }
    const isMissingTableOrColumn =
      code === 'P2021' ||
      code === 'P2022' ||
      /does not exist|relation.*PasswordReset|column.*does not exist/i.test(msg)
    if (isMissingTableOrColumn) {
      console.error('reset-password: PasswordReset table/column may be missing. Run the add_password_reset_table migration on the server.')
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: {
            code: 'PASSWORD_RESET_UNAVAILABLE',
            message: 'Password reset is temporarily unavailable. Please contact your administrator.'
          }
        })
      )
      return
    }
    if (code === 'P2025' || /Record to update not found|Record not found/i.test(msg)) {
      return badRequest(res, 'Invalid or expired token')
    }
    serverError(res, 'Internal server error', err?.message)
  }
}

export default withLogging(withHttp(handler))


