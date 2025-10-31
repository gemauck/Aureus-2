import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const userId = req.user?.sub
    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    const { password } = req.body || {}
    if (!password) {
      return badRequest(res, 'Password is required to disable 2FA')
    }

    // Verify password
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user || !user.passwordHash) {
      return badRequest(res, 'User not found or password not set')
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      // Log failed attempt
      try {
        await prisma.securityEvent.create({
          data: {
            userId,
            eventType: '2fa_disable_failed',
            ipAddress: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            details: JSON.stringify({ reason: 'invalid_password' })
          }
        })
      } catch (e) {
        // Don't fail if logging fails
      }

      return badRequest(res, 'Invalid password')
    }

    // Check if 2FA is enabled
    const twoFactor = await prisma.twoFactor.findUnique({
      where: { userId }
    })

    if (!twoFactor || !twoFactor.enabled) {
      return badRequest(res, '2FA is not enabled')
    }

    // Disable 2FA
    await prisma.twoFactor.update({
      where: { userId },
      data: {
        enabled: false
      }
    })

    // Log security event
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: '2fa_disabled',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent']
        }
      })
    } catch (e) {
      // Don't fail if logging fails
    }

    return ok(res, {
      disabled: true,
      message: '2FA has been disabled successfully'
    })
  } catch (error) {
    console.error('❌ Error disabling 2FA:', error)
    return serverError(res, 'Failed to disable 2FA', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

