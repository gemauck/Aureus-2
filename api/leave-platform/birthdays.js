import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      try {
        // Get current user ID and role
        const currentUserId = req.user?.sub || req.user?.id
        const userRole = req.user?.role?.toLowerCase()

        // If no user ID, return unauthorized
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

        // Build where clause: admins see all birthdays, regular users see only their own
        const whereClause = isAdmin ? {} : { userId: currentUserId }

        const birthdays = await prisma.birthday.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            date: 'asc'
          }
        })

        const formattedBirthdays = birthdays.map(birthday => ({
          id: birthday.id,
          userId: birthday.userId,
          employeeName: birthday.user.name,
          employeeEmail: birthday.user.email,
          date: birthday.date.toISOString().split('T')[0],
          notes: birthday.notes
        }))

        return ok(res, { birthdays: formattedBirthdays })
      } catch (dbError) {
        console.error('❌ Database error fetching birthdays:', dbError)
        return serverError(res, 'Failed to fetch birthdays', dbError.message)
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req)
        const { userId, date, notes } = body

        if (!userId || !date) {
          return badRequest(res, 'Missing required fields: userId, date')
        }

        const birthday = await prisma.birthday.upsert({
          where: {
            userId
          },
          update: {
            date: new Date(date),
            notes: notes || ''
          },
          create: {
            userId,
            date: new Date(date),
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

        return ok(res, { birthday })
      } catch (dbError) {
        console.error('❌ Database error creating/updating birthday:', dbError)
        return serverError(res, 'Failed to create/update birthday', dbError.message)
      }
    }

    return badRequest(res, 'Invalid method')
  } catch (error) {
    console.error('❌ Birthdays API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

