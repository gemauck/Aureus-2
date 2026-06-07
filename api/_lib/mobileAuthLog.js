import { getClientIpFromRequest } from './manufacturingAuditLog.js'

/** @returns {'android' | 'ios' | 'unknown'} */
export function resolveMobilePlatform(req, body) {
  const fromBody = String(body?.platform || '').trim().toLowerCase()
  if (fromBody === 'android' || fromBody === 'ios') return fromBody

  const ua = String(req.headers?.['user-agent'] || '').toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
  return 'unknown'
}

function requestMeta(req) {
  return {
    ipAddress: getClientIpFromRequest(req),
    userAgent: (req.headers?.['user-agent'] || '').toString().slice(0, 512) || null
  }
}

/**
 * Persist mobile app login for reporting (SecurityEvent + AuditLog on success).
 * Non-fatal — never throws.
 */
export async function logMobileLogin(prisma, req, body, user, { success, reason } = {}) {
  const platform = resolveMobilePlatform(req, body)
  const { ipAddress, userAgent } = requestMeta(req)
  const details = {
    platform,
    loginMethod: 'mobile_app',
    success: !!success,
    ...(reason ? { reason } : {})
  }

  if (user?.id) {
    void prisma.securityEvent
      .create({
        data: {
          userId: user.id,
          eventType: success ? 'mobile_login_success' : 'mobile_login_failed',
          ipAddress,
          userAgent,
          details: JSON.stringify(details)
        }
      })
      .catch(() => null)

    if (success) {
      void prisma.auditLog
        .create({
          data: {
            actorId: user.id,
            action: 'login',
            entity: 'authentication',
            entityId: 'mobile_app',
            diff: JSON.stringify({
              user: user.name || user.email,
              userId: user.id,
              userRole: user.role || 'user',
              details: { loginMethod: 'mobile_app', platform },
              ipAddress,
              sessionId: 'N/A',
              success: true
            })
          }
        })
        .catch(() => null)
    }
  }

  return { platform, ipAddress }
}
