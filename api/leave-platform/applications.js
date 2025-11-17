import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, notFound } from '../_lib/response.js'
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

    // List all leave applications (GET /api/leave-platform/applications)
    if (req.method === 'GET') {
      try {
        // Get current user ID and role
        const userRole = req.user?.role?.toLowerCase()

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

        // Build where clause: admins see all, regular users see only their own
        const whereClause = isAdmin ? {} : { userId: currentUserId }

        const applications = await prisma.leaveApplication.findMany({
          where: whereClause,
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
          },
          orderBy: {
            appliedDate: 'desc'
          }
        })

        // Format applications for frontend
        const formattedApplications = applications.map(app => ({
          id: app.id,
          userId: app.userId,
          userName: app.user.name,
          userEmail: app.user.email,
          leaveType: app.leaveType,
          startDate: app.startDate.toISOString().split('T')[0],
          endDate: app.endDate.toISOString().split('T')[0],
          days: app.days,
          reason: app.reason,
          emergency: app.emergency,
          status: app.status,
          appliedDate: app.appliedDate.toISOString().split('T')[0],
          approvedDate: app.approvedDate ? app.approvedDate.toISOString().split('T')[0] : null,
          rejectedDate: app.rejectedDate ? app.rejectedDate.toISOString().split('T')[0] : null,
          approvedByName: app.approvedBy?.name || null,
          rejectedByName: app.rejectedBy?.name || null,
          rejectionReason: app.rejectionReason || null
        }))

        return ok(res, { applications: formattedApplications })
      } catch (dbError) {
        console.error('❌ Database error fetching leave applications:', dbError)
        return serverError(res, 'Failed to fetch leave applications', dbError.message)
      }
    }

    // Create new leave application (POST /api/leave-platform/applications)
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req)
        const { userId, userEmail, userName, leaveType, startDate, endDate, days, reason, emergency } = body

        if (!userId || !leaveType || !startDate || !endDate || !reason) {
          return badRequest(res, 'Missing required fields: userId, leaveType, startDate, endDate, reason')
        }

        // Validate dates
        const start = new Date(startDate)
        const end = new Date(endDate)
        if (start > end) {
          return badRequest(res, 'Start date must be before end date')
        }

        // Calculate working days if not provided
        let workingDays = days
        if (!workingDays) {
          workingDays = calculateWorkingDays(start, end)
        }

        const application = await prisma.leaveApplication.create({
          data: {
            userId,
            leaveType,
            startDate: start,
            endDate: end,
            days: workingDays,
            reason,
            emergency: emergency || false,
            status: 'pending'
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

        return ok(res, { application })
      } catch (dbError) {
        console.error('❌ Database error creating leave application:', dbError)
        return serverError(res, 'Failed to create leave application', dbError.message)
      }
    }

    return badRequest(res, 'Invalid method')
  } catch (error) {
    console.error('❌ Leave applications API error:', error)
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

