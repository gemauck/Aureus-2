import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../_lib/hrAccess.js'

async function handler(req, res) {
  try {
    const currentUserId = req.user?.sub || req.user?.id
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    if (req.method === 'GET') {
      try {
        if (!currentUserId) {
          return badRequest(res, 'User not authenticated')
        }

        const isElevated = isHrAdministrator(actor)
        const whereClause = isElevated ? {} : { userId: currentUserId }

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

        if (!isHrAdministrator(actor) && String(userId) !== String(currentUserId)) {
          return forbidden(res, 'You can only set your own birthday record')
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

