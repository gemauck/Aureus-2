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

    // Get current user ID and role
    const currentUserId = req.user?.sub || req.user?.id
    if (!currentUserId) {
      return badRequest(res, 'User not authenticated')
    }

    // Get user from database to verify role
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true }
    })

    if (!currentUser) {
      return badRequest(res, 'User not found')
    }

    const isAdmin = currentUser.role?.toLowerCase() === 'admin'

    // Only admins can approve leave applications
    if (!isAdmin) {
      return badRequest(res, 'Only administrators can approve leave applications')
    }

    const body = await parseJsonBody(req)
    const { approvedBy } = body

    if (!approvedBy) {
      return badRequest(res, 'Approver ID required')
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
      return badRequest(res, 'Only pending applications can be approved')
    }

    // Update the application
    const updated = await prisma.leaveApplication.update({
      where: { id },
      data: {
        status: 'approved',
        approvedDate: new Date(),
        approvedById: approvedBy
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approvedBy: {
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
    console.error('❌ Approve leave application error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

