import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../../../_lib/response.js'
import { parseJsonBody } from '../../../_lib/body.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../../../_lib/hrAccess.js'

async function handler(req, res) {
  try {
    const currentUserId = req.user?.sub || req.user?.id
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const id = req.params?.id || req.url?.split('/').pop()?.split('?')[0]
    if (!id) {
      return badRequest(res, 'Leave application ID required')
    }

    const body = await parseJsonBody(req)
    const { cancelledBy } = body

    // If no user ID, return unauthorized
    if (!currentUserId) {
      return badRequest(res, 'User not authenticated')
    }

    const isElevated = isHrAdministrator(actor)

    // Get the application
    const application = await prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!application) {
      return notFound(res, 'Leave application not found')
    }

    if (!isElevated && application.userId !== currentUserId) {
      return badRequest(res, 'You can only cancel your own leave applications')
    }

    // Only pending or approved applications can be cancelled
    if (application.status !== 'pending' && application.status !== 'approved') {
      return badRequest(res, 'Only pending or approved applications can be cancelled')
    }

    // Update the application
    // Note: Schema doesn't have cancelledDate or cancelledById fields,
    // so we just update the status. The updatedAt field will be automatically updated.
    const updated = await prisma.leaveApplication.update({
      where: { id },
      data: {
        status: 'cancelled'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    // TODO: Send notification email to user

    return ok(res, { application: updated })
  } catch (error) {
    console.error('❌ Cancel leave application error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

