import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import speakeasy from 'speakeasy'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const { userId, code } = req.body || {}
    if (!userId || !code) {
      return badRequest(res, 'User ID and verification code are required')
    }

    // Get 2FA record
    const twoFactor = await prisma.twoFactor.findUnique({
      where: { userId }
    })

    if (!twoFactor || !twoFactor.enabled) {
      return badRequest(res, '2FA is not enabled for this user')
    }

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''), // Remove spaces
      window: 2 // Allow 2 time steps tolerance
    })

    if (!verified) {
      // Check backup codes
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

        return unauthorized(res, 'Invalid verification code')
      }

      // Remove used backup code
      backupCodes.splice(codeIndex, 1)
      
      await prisma.twoFactor.update({
        where: { userId },
        data: {
          backupCodes: JSON.stringify(backupCodes)
        }
      })
    }

    // Log successful verification
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: '2fa_verification_success',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent']
        }
      })
    } catch (e) {
      // Don't fail if logging fails
    }

    return ok(res, {
      verified: true,
      message: '2FA verification successful'
    })
  } catch (error) {
    console.error('❌ Error verifying 2FA:', error)
    return serverError(res, 'Failed to verify 2FA', error.message)
  }
}

export default withHttp(withLogging(handler))

