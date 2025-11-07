import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../../../_lib/response.js'
import { parseJsonBody } from '../../../_lib/body.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const id = req.params?.id || req.url?.split('/').pop()?.split('?')[0]
    if (!id) {
      return badRequest(res, 'Leave application ID required')
    }

    const body = await parseJsonBody(req)
    const { rejectedBy, reason } = body

    if (!rejectedBy) {
      return badRequest(res, 'Rejector ID required')
    }

    if (!reason) {
      return badRequest(res, 'Rejection reason required')
    }

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

    if (application.status !== 'pending') {
      return badRequest(res, 'Only pending applications can be rejected')
    }

    // Update the application
    const updated = await prisma.leaveApplication.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedDate: new Date(),
        rejectedById: rejectedBy,
        rejectionReason: reason
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rejectedBy: {
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
    console.error('❌ Reject leave application error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

