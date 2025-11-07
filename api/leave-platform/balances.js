import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      try {
        const currentYear = new Date().getFullYear()
        const balances = await prisma.leaveBalance.findMany({
          where: {
            year: currentYear
          },
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

