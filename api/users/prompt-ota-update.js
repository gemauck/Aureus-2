// Admin: send push nudge so a mobile user checks for and applies an OTA update.
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendPushToUsers } from '../_lib/expoPush.js'

const ADMIN_ROLES = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin']

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method. Use POST.')

  try {
    const actorRole = req.user?.role?.toLowerCase()
    const isAdmin = ADMIN_ROLES.includes(actorRole)
    if (!req.user || (!isAdmin && !req.user.permissions?.includes('manage_users'))) {
      return unauthorized(res, 'Permission required: manage_users')
    }

    const body = await parseJsonBody(req)
    const userId = String(body.userId || '').trim()
    if (!userId) return badRequest(res, 'userId is required')

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true }
    })
    if (!target) return badRequest(res, 'User not found')
    if (target.status !== 'active') return badRequest(res, 'User is not active')

    const pushCount = await prisma.pushDeviceToken.count({ where: { userId } })
    if (!pushCount) {
      return badRequest(res, 'No push token registered for this user. They must open the app and allow notifications.')
    }

    const result = await sendPushToUsers([userId], {
      title: 'App update available',
      body: 'Tap to check for the latest ERP update and restart if prompted.',
      channelId: 'erp',
      data: { type: 'ota_nudge' }
    })

    if (!result.sent) {
      return badRequest(res, result.reason === 'no_tokens' ? 'Push delivery failed: no valid tokens' : 'Push delivery failed')
    }

    void prisma.auditLog
      .create({
        data: {
          actorId: req.user.sub || req.user.id,
          action: 'prompt_ota_update',
          entity: 'users',
          entityId: userId,
          diff: JSON.stringify({
            targetUser: target.name || target.email,
            pushSent: result.sent
          })
        }
      })
      .catch(() => null)

    return ok(res, {
      success: true,
      pushSent: result.sent,
      userId
    })
  } catch (error) {
    return serverError(res, 'Failed to prompt OTA update', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
