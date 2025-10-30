import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import crypto from 'crypto'
import { sendPasswordResetEmail } from '../_lib/email.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  try {
    const { email } = req.body || {}
    if (!email) return badRequest(res, 'Email is required')

    // Always respond success to avoid user enumeration
    const genericResponse = () => ok(res, { message: 'If the email exists, a reset link has been sent' })

    // Find user silently
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || user.status !== 'active') {
      return genericResponse()
    }

    // Invalidate previous tokens
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() }
    })

    // Create secure token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt }
    })

    // Build reset link
    const appUrl = process.env.APP_URL || 'http://localhost:3001'
    const resetLink = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`

    // Try send email, but don't reveal errors to client
    try {
      await sendPasswordResetEmail({ email: user.email, name: user.name || user.email, resetLink })
    } catch (e) {
      console.warn('⚠️ Password reset email send failed; continuing gracefully:', e.message)
    }

    return genericResponse()
  } catch (err) {
    console.error('request-password-reset error:', err)
    return serverError(res, 'Internal server error', err.message)
  }
}

export default withLogging(withHttp(handler))


