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
        const currentYear = new Date().getFullYear()

        // Build where clause: admins see all, regular users see only their own
        const whereClause = isAdmin 
          ? { year: currentYear }
          : { userId: currentUserId, year: currentYear }

        const balances = await prisma.leaveBalance.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                department: true
              }
            }
          },
          orderBy: {
            user: {
              name: 'asc'
            }
          }
        })

        const formattedBalances = balances.map(balance => ({
          id: balance.id,
          userId: balance.userId,
          employeeName: balance.user.name,
          employeeEmail: balance.user.email,
          leaveType: balance.leaveType,
          available: balance.available,
          used: balance.used,
          balance: balance.balance,
          year: balance.year,
          notes: balance.notes
        }))

        return ok(res, { balances: formattedBalances })
      } catch (dbError) {
        console.error('❌ Database error fetching leave balances:', dbError)
        return serverError(res, 'Failed to fetch leave balances', dbError.message)
      }
    }

    if (req.method === 'POST') {
      // Create or update leave balance
      try {
        const body = await parseJsonBody(req)
        const { userId, leaveType, available, used, year, notes } = body

        if (!userId || !leaveType) {
          return badRequest(res, 'Missing required fields: userId, leaveType')
        }

        const balanceYear = year || new Date().getFullYear()
        const balance = available - (used || 0)

        const leaveBalance = await prisma.leaveBalance.upsert({
          where: {
            userId_leaveType_year: {
              userId,
              leaveType,
              year: balanceYear
            }
          },
          update: {
            available,
            used: used || 0,
            balance,
            notes: notes || ''
          },
          create: {
            userId,
            leaveType,
            available,
            used: used || 0,
            balance,
            year: balanceYear,
            notes: notes || ''
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

        return ok(res, { balance: leaveBalance })
      } catch (dbError) {
        console.error('❌ Database error creating/updating leave balance:', dbError)
        return serverError(res, 'Failed to create/update leave balance', dbError.message)
      }
    }

    return badRequest(res, 'Invalid method')
  } catch (error) {
    console.error('❌ Leave balances API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

