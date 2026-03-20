import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../../../_lib/response.js'
import { parseJsonBody } from '../../../_lib/body.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'

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

    const id = req.params?.id || req.url?.split('/').pop()?.split('?')[0]
    if (!id) {
      return badRequest(res, 'Leave application ID required')
    }

    // If no user ID, return unauthorized
    if (!currentUserId) {
      return badRequest(res, 'User not authenticated')
    }

    // Get user from database to verify role
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true, email: true }
    })

    if (!currentUser) {
      return badRequest(res, 'User not found')
    }

    const isAdmin = currentUser.role?.toLowerCase() === 'admin'

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

    // Check permissions: users can only access their own applications unless admin
    if (!isAdmin && application.userId !== currentUserId) {
      return badRequest(res, 'You can only access your own leave applications')
    }

    // Update leave application (PATCH)
    if (req.method === 'PATCH' || req.method === 'PUT') {
      try {
        const body = await parseJsonBody(req)
        const { leaveType, startDate, endDate, days, reason, emergency } = body

        // Validate that only pending applications can be edited
        if (application.status !== 'pending') {
          return badRequest(res, 'Only pending leave applications can be edited')
        }

        // Check permissions: users can only edit their own applications unless admin
        if (!isAdmin && application.userId !== currentUserId) {
          return badRequest(res, 'You can only edit your own leave applications')
        }

        const updateData = {}
        
        if (leaveType !== undefined) updateData.leaveType = leaveType
        if (startDate !== undefined) {
          updateData.startDate = new Date(startDate)
        }
        if (endDate !== undefined) {
          updateData.endDate = new Date(endDate)
        }
        if (reason !== undefined) updateData.reason = reason
        if (emergency !== undefined) updateData.emergency = emergency

        // If dates are being updated, validate and recalculate days
        if (startDate !== undefined || endDate !== undefined) {
          const start = updateData.startDate || application.startDate
          const end = updateData.endDate || application.endDate
          
          if (new Date(start) > new Date(end)) {
            return badRequest(res, 'Start date must be before end date')
          }

          // Recalculate working days
          const workingDays = calculateWorkingDays(start, end)
          updateData.days = days !== undefined ? days : workingDays
        } else if (days !== undefined) {
          updateData.days = days
        }

        const updated = await prisma.leaveApplication.update({
          where: { id },
          data: updateData,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                department: true
              }
            },
            approvedBy: {
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

        // Format response
        const formattedApplication = {
          id: updated.id,
          userId: updated.userId,
          userName: updated.user.name,
          userEmail: updated.user.email,
          leaveType: updated.leaveType,
          startDate: updated.startDate.toISOString().split('T')[0],
          endDate: updated.endDate.toISOString().split('T')[0],
          days: updated.days,
          reason: updated.reason,
          emergency: updated.emergency,
          status: updated.status,
          appliedDate: updated.appliedDate.toISOString().split('T')[0],
          approvedDate: updated.approvedDate ? updated.approvedDate.toISOString().split('T')[0] : null,
          rejectedDate: updated.rejectedDate ? updated.rejectedDate.toISOString().split('T')[0] : null,
          approvedByName: updated.approvedBy?.name || null,
          rejectedByName: updated.rejectedBy?.name || null,
          rejectionReason: updated.rejectionReason || null
        }

        return ok(res, { application: formattedApplication })
      } catch (dbError) {
        console.error('❌ Database error updating leave application:', dbError)
        return serverError(res, 'Failed to update leave application', dbError.message)
      }
    }

    // Delete leave application (DELETE)
    if (req.method === 'DELETE') {
      try {
        // Only pending applications can be deleted
        if (application.status !== 'pending') {
          return badRequest(res, 'Only pending leave applications can be deleted')
        }

        // Check permissions: users can only delete their own applications unless admin
        if (!isAdmin && application.userId !== currentUserId) {
          return badRequest(res, 'You can only delete your own leave applications')
        }

        await prisma.leaveApplication.delete({
          where: { id }
        })

        return ok(res, { message: 'Leave application deleted successfully' })
      } catch (dbError) {
        console.error('❌ Database error deleting leave application:', dbError)
        return serverError(res, 'Failed to delete leave application', dbError.message)
      }
    }

    // Get single leave application (GET)
    if (req.method === 'GET') {
      const formattedApplication = {
        id: application.id,
        userId: application.userId,
        userName: application.user.name,
        userEmail: application.user.email,
        leaveType: application.leaveType,
        startDate: application.startDate.toISOString().split('T')[0],
        endDate: application.endDate.toISOString().split('T')[0],
        days: application.days,
        reason: application.reason,
        emergency: application.emergency,
        status: application.status,
        appliedDate: application.appliedDate.toISOString().split('T')[0],
        approvedDate: application.approvedDate ? application.approvedDate.toISOString().split('T')[0] : null,
        rejectedDate: application.rejectedDate ? application.rejectedDate.toISOString().split('T')[0] : null
      }

      return ok(res, { application: formattedApplication })
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Leave application API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

// Calculate working days (excluding weekends)
function calculateWorkingDays(startDate, endDate) {
  let count = 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay()
    // Skip weekends (Sunday = 0, Saturday = 6)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
  }
  
  return count
}

export default withHttp(withLogging(authRequired(handler)))

