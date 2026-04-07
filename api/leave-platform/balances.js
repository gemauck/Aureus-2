import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../_lib/hrAccess.js'
import {
  buildComputedBalanceRowsForUser,
  mergeDbAndComputedBalances
} from './_lib/computedLeaveBalances.js'

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
        const currentYear = new Date().getFullYear()

        /** If there are no rows for the calendar year (e.g. data still keyed to last year), use the latest year that has data. */
        let effectiveYear = currentYear
        if (isElevated) {
          const countThisYear = await prisma.leaveBalance.count({ where: { year: currentYear } })
          if (countThisYear === 0) {
            const agg = await prisma.leaveBalance.aggregate({ _max: { year: true } })
            if (agg._max.year != null) effectiveYear = agg._max.year
          }
        } else {
          const countThisYear = await prisma.leaveBalance.count({
            where: { userId: currentUserId, year: currentYear }
          })
          if (countThisYear === 0) {
            const agg = await prisma.leaveBalance.aggregate({
              where: { userId: currentUserId },
              _max: { year: true }
            })
            if (agg._max.year != null) effectiveYear = agg._max.year
          }
        }

        const whereClause = isElevated
          ? { year: effectiveYear }
          : { userId: currentUserId, year: effectiveYear }

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

        const yStart = new Date(effectiveYear, 0, 1)
        const yEnd = new Date(effectiveYear, 11, 31, 23, 59, 59, 999)

        const withRecordFlag = balances.map(balance => ({
          id: balance.id,
          userId: balance.userId,
          employeeName: balance.user.name,
          employeeEmail: balance.user.email,
          leaveType: balance.leaveType,
          available: balance.available,
          used: balance.used,
          balance: balance.balance,
          year: balance.year,
          notes: balance.notes,
          source: 'record'
        }))

        let formattedBalances

        if (!isElevated) {
          const me = await prisma.user.findUnique({
            where: { id: currentUserId },
            select: { id: true, name: true, email: true, employmentDate: true }
          })
          let computed = []
          if (me?.employmentDate) {
            const myApps = await prisma.leaveApplication.findMany({
              where: {
                userId: currentUserId,
                status: 'approved',
                AND: [{ startDate: { lte: yEnd } }, { endDate: { gte: yStart } }]
              }
            })
            computed = buildComputedBalanceRowsForUser(me, effectiveYear, myApps)
          }
          formattedBalances = mergeDbAndComputedBalances(withRecordFlag, computed)
        } else {
          const staff = await prisma.user.findMany({
            where: { status: 'active', employmentDate: { not: null } },
            select: { id: true, name: true, email: true, employmentDate: true }
          })

          const userMap = new Map(staff.map(u => [u.id, u]))
          for (const row of withRecordFlag) {
            if (!userMap.has(row.userId)) {
              userMap.set(row.userId, {
                id: row.userId,
                name: row.employeeName,
                email: row.employeeEmail,
                employmentDate: null
              })
            }
          }

          const allUserIdsForApps = [...userMap.keys()]
          const allApps =
            allUserIdsForApps.length > 0
              ? await prisma.leaveApplication.findMany({
                  where: {
                    status: 'approved',
                    userId: { in: allUserIdsForApps },
                    AND: [{ startDate: { lte: yEnd } }, { endDate: { gte: yStart } }]
                  }
                })
              : []

          const appsByUser = new Map()
          for (const a of allApps) {
            if (!appsByUser.has(a.userId)) appsByUser.set(a.userId, [])
            appsByUser.get(a.userId).push(a)
          }

          const dbByUser = new Map()
          for (const row of withRecordFlag) {
            if (!dbByUser.has(row.userId)) dbByUser.set(row.userId, [])
            dbByUser.get(row.userId).push(row)
          }

          const merged = []
          for (const [uid, u] of userMap) {
            const dbRows = dbByUser.get(uid) || []
            const apps = appsByUser.get(uid) || []
            const computed = u.employmentDate
              ? buildComputedBalanceRowsForUser(u, effectiveYear, apps)
              : []
            const part = mergeDbAndComputedBalances(dbRows, computed)
            if (part.length > 0) merged.push(...part)
          }

          formattedBalances = merged.sort((a, b) => {
            const na = (a.employeeName || '').localeCompare(b.employeeName || '', undefined, {
              sensitivity: 'base'
            })
            if (na !== 0) return na
            return String(a.leaveType || '').localeCompare(String(b.leaveType || ''))
          })
        }

        return ok(res, {
          balances: formattedBalances,
          balanceYear: effectiveYear,
          computedBalancesNote:
            'Rows with source "computed" follow a BCEA-style baseline from each person’s employment start date. Official balances from Import or HR entry replace those types when present.'
        })
      } catch (dbError) {
        console.error('❌ Database error fetching leave balances:', dbError)
        return serverError(res, 'Failed to fetch leave balances', dbError.message)
      }
    }

    if (req.method === 'POST') {
      // Create or update leave balance
      try {
        if (!isHrAdministrator(actor)) {
          return forbidden(res, 'Only HR administrators can create or update leave balances')
        }
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

