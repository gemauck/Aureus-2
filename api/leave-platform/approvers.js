import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    // LEAVE PLATFORM RESTRICTION: Only allow garethm@abcotronics.co.za until completion
    const currentUserId = req.user?.sub || req.user?.id
    if (currentUserId) {
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, email: true, role: true }
      })
      
      if (currentUser) {
        const userEmail = currentUser.email?.toLowerCase()
        if (userEmail !== 'garethm@abcotronics.co.za') {
          return badRequest(res, 'Access denied: Leave platform is temporarily restricted')
        }
      }
    }

    if (req.method === 'GET') {
      try {
        const approvers = await prisma.leaveApprover.findMany({
          where: {
            isActive: true
          },
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            department: 'asc'
          }
        })

        const formattedApprovers = approvers.map(approver => ({
          id: approver.id,
          department: approver.department,
          approverId: approver.approverId,
          approverName: approver.approver.name,
          approverEmail: approver.approver.email,
          isActive: approver.isActive
        }))

        return ok(res, { approvers: formattedApprovers })
      } catch (dbError) {
        console.error('❌ Database error fetching leave approvers:', dbError)
        return serverError(res, 'Failed to fetch leave approvers', dbError.message)
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req)
        const { department, approverId } = body

        if (!department || !approverId) {
          return badRequest(res, 'Missing required fields: department, approverId')
        }

        const approver = await prisma.leaveApprover.upsert({
          where: {
            department_approverId: {
              department,
              approverId
            }
          },
          update: {
            isActive: true
          },
          create: {
            department,
            approverId,
            isActive: true
          },
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        })

        return ok(res, { approver })
      } catch (dbError) {
        console.error('❌ Database error creating/updating leave approver:', dbError)
        return serverError(res, 'Failed to create/update leave approver', dbError.message)
      }
    }

    if (req.method === 'DELETE') {
      try {
        const body = await parseJsonBody(req)
        const { id } = body

        if (!id) {
          return badRequest(res, 'Approver ID required')
        }

        await prisma.leaveApprover.update({
          where: { id },
          data: {
            isActive: false
          }
        })

        return ok(res, { deleted: true })
      } catch (dbError) {
        console.error('❌ Database error deleting leave approver:', dbError)
        return serverError(res, 'Failed to delete leave approver', dbError.message)
      }
    }

    return badRequest(res, 'Invalid method')
  } catch (error) {
    console.error('❌ Leave approvers API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

