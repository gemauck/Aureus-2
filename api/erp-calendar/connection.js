/**
 * GET /api/erp-calendar/connection — status
 * DELETE /api/erp-calendar/connection — disconnect Google (removes tokens)
 */
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { requireErpCalendarAccess } from '../_lib/erpCalendarAccess.js'

async function handler(req, res) {
  const userId = req.user?.sub
  if (!userId) {
    return badRequest(res, 'User required')
  }

  if (!(await requireErpCalendarAccess(req, res))) {
    return
  }

  if (req.method === 'GET') {
    const row = await prisma.erpGoogleCalendarConnection.findUnique({
      where: { userId },
      select: { googleEmail: true, createdAt: true, updatedAt: true }
    })
    return ok(res, {
      connected: !!row,
      googleEmail: row?.googleEmail || null,
      connectedAt: row?.createdAt || null
    })
  }

  if (req.method === 'DELETE') {
    await prisma.erpGoogleCalendarConnection.deleteMany({ where: { userId } })
    return ok(res, { disconnected: true })
  }

  return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))
