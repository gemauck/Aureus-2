import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import speakeasy from 'speakeasy'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const userId = req.user?.sub
    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    const { code } = req.body || {}
    if (!code || typeof code !== 'string') {
      return badRequest(res, 'Verification code is required')
    }

    // Get 2FA record
    const twoFactor = await prisma.twoFactor.findUnique({
      where: { userId }
    })

    if (!twoFactor) {
      return badRequest(res, '2FA setup not initiated. Please enable 2FA first.')
    }

    if (twoFactor.enabled) {
      return badRequest(res, '2FA is already enabled')
    }

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''), // Remove spaces
      window: 2 // Allow 2 time steps tolerance (60 seconds)
    })

    if (!verified) {
      // Check backup codes as fallback
      const backupCodes = JSON.parse(twoFactor.backupCodes || '[]')
      const codeIndex = backupCodes.indexOf(code.toUpperCase())

      if (codeIndex === -1) {
        // Log failed verification
        try {
          await prisma.securityEvent.create({
            data: {
              userId,
              eventType: '2fa_verification_failed',
              ipAddress: req.ip || req.headers['x-forwarded-for'],
              userAgent: req.headers['user-agent']
            }
          })
        } catch (e) {
          // Don't fail if logging fails
        }

        return badRequest(res, 'Invalid verification code')
      }

      // Remove used backup code
      backupCodes.splice(codeIndex, 1)
    }

    // Enable 2FA
    await prisma.twoFactor.update({
      where: { userId },
      data: {
        enabled: true,
        backupCodes: verified ? twoFactor.backupCodes : JSON.stringify(backupCodes)
      }
    })

    // Log successful verification
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: '2fa_enabled',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent']
        }
      })
    } catch (e) {
      // Don't fail if logging fails
    }

    return ok(res, {
      enabled: true,
      message: '2FA has been enabled successfully'
    })
  } catch (error) {
    console.error('❌ Error verifying 2FA setup:', error)
    return serverError(res, 'Failed to verify 2FA setup', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

