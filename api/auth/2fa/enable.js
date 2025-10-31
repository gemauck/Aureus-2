import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const userId = req.user?.sub
    if (!userId) {
      return badRequest(res, 'User not authenticated')
    }

    // Check if 2FA is already enabled
    const existing2FA = await prisma.twoFactor.findUnique({
      where: { userId }
    })

    if (existing2FA?.enabled) {
      return badRequest(res, '2FA is already enabled')
    }

    // Generate a new secret
    const secret = speakeasy.generateSecret({
      name: `Abcotronics ERP (${req.user.email || userId})`,
      issuer: 'Abcotronics ERP',
      length: 32
    })

    // Generate backup codes (10 codes, 8 characters each)
    const backupCodes = Array.from({ length: 10 }, () => {
      return Math.random().toString(36).substring(2, 10).toUpperCase()
    })

    // Upsert 2FA record (create or update)
    await prisma.twoFactor.upsert({
      where: { userId },
      create: {
        userId,
        secret: secret.base32,
        backupCodes: JSON.stringify(backupCodes),
        enabled: false // Not enabled until verified
      },
      update: {
        secret: secret.base32,
        backupCodes: JSON.stringify(backupCodes),
        enabled: false
      }
    })

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url)

    // Log security event
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: '2fa_setup_initiated',
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent']
        }
      })
    } catch (e) {
      // Don't fail if logging fails
      console.warn('Failed to log security event:', e)
    }

    return ok(res, {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32,
      backupCodes: backupCodes // Return for display (user must save these)
    })
  } catch (error) {
    console.error('❌ Error enabling 2FA:', error)
    return serverError(res, 'Failed to enable 2FA', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

