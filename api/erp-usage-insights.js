// GET /api/erp-usage-insights?days=30 — dashboard usage rollup (super-admins only; read-only).
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, forbidden, badRequest, serverError } from './_lib/response.js'
import { isSuperAdminRole } from './_lib/authRoles.js'

const SESSION_CAP_MS = 72 * 60 * 60 * 1000
const MAX_SESSION_ROWS = 15000

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed')
  }

  try {
    const tokenUserId = req.user?.sub || req.user?.id
    if (!tokenUserId) {
      return forbidden(res, 'Authentication required')
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: tokenUserId },
      select: { role: true }
    })

    if (!dbUser || !isSuperAdminRole(dbUser.role)) {
      return forbidden(res, 'Super-admin access required')
    }

    let days = parseInt(String(req.query?.days ?? '30'), 10)
    if (Number.isNaN(days)) days = 30
    days = Math.min(90, Math.max(1, days))

    const since = new Date(Date.now() - days * 86400000)

    const [activityGroups, moduleGroups, sessions] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['actorId'],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 25
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 30
      }),
      prisma.session.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true, createdAt: true, expiresAt: true },
        take: MAX_SESSION_ROWS
      })
    ])

    const nowMs = Date.now()
    const sessionMinutesByUser = {}
    for (const s of sessions) {
      const start = new Date(s.createdAt).getTime()
      const exp = new Date(s.expiresAt).getTime()
      const end = Math.min(nowMs, exp)
      let span = end - start
      if (span < 0) span = 0
      if (span > SESSION_CAP_MS) span = SESSION_CAP_MS
      const minutes = span / 60000
      sessionMinutesByUser[s.userId] = (sessionMinutesByUser[s.userId] || 0) + minutes
    }

    const userIds = [
      ...new Set([...activityGroups.map((g) => g.actorId), ...Object.keys(sessionMinutesByUser)])
    ]

    const users =
      userIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, lastSeenAt: true }
          })

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

    const topBySessionMinutes = Object.entries(sessionMinutesByUser)
      .map(([id, minutes]) => {
        const u = userMap[id]
        return {
          userId: id,
          name: u?.name || u?.email || 'Unknown',
          email: u?.email || null,
          minutes: Math.round(minutes * 10) / 10,
          lastSeenAt: u?.lastSeenAt ? u.lastSeenAt.toISOString() : null
        }
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 15)

    const topByActivity = activityGroups.map((g) => {
      const u = userMap[g.actorId]
      return {
        userId: g.actorId,
        name: u?.name || u?.email || 'Unknown',
        email: u?.email || null,
        events: g._count.id,
        lastSeenAt: u?.lastSeenAt ? u.lastSeenAt.toISOString() : null
      }
    })

    const modules = moduleGroups.map((m) => ({
      module: m.entity || '—',
      events: m._count.id
    }))

    return ok(res, {
      rangeDays: days,
      since: since.toISOString(),
      topBySessionMinutes,
      topByActivity,
      modules,
      meta: {
        sessionsSampled: sessions.length,
        sessionsCapped: sessions.length >= MAX_SESSION_ROWS,
        sessionWindowNote:
          'Minutes sum login→min(now, session expiry), capped per session (72h). Approximate presence, not focused work time.'
      },
      generatedAt: new Date().toISOString()
    })
  } catch (err) {
    console.error('erp-usage-insights:', err)
    return serverError(res, 'Failed to load usage insights', err.message)
  }
}

export default authRequired(handler)
