import crypto from 'crypto'
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { canAccessLeaveModule, isHrAdministrator, requireLeaveModuleAccess } from '../_lib/hrAccess.js'

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex')
}

function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim().slice(0, 128)
  }
  if (req.socket?.remoteAddress) return String(req.socket.remoteAddress).slice(0, 128)
  return null
}

async function handler(req, res) {
  try {
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    const elevated = isHrAdministrator(actor)

    if (req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'local'}`)
      const report = url.searchParams.get('report') === '1'

      if (report) {
        if (!elevated) return forbidden(res, 'Only HR administrators can view acknowledgment report')
        const published = await prisma.hrPolicy.findMany({
          where: { status: 'published' },
          orderBy: [{ category: 'asc' }, { title: 'asc' }],
          select: { id: true, title: true, slug: true, version: true, category: true }
        })
        const allUsers = await prisma.user.findMany({
          where: { status: { not: 'inactive' } },
          select: { id: true, name: true, email: true, role: true, permissions: true }
        })
        const leaveUsers = allUsers.filter((u) => canAccessLeaveModule(u))

        const reportRows = []
        for (const pol of published) {
          const acks = await prisma.hrPolicyAcknowledgment.findMany({
            where: { policyId: pol.id, policyVersion: pol.version },
            select: { userId: true, acknowledgedAt: true }
          })
          const ackMap = new Map(acks.map((a) => [a.userId, a.acknowledgedAt]))
          const acknowledged = leaveUsers.filter((u) => ackMap.has(u.id))
          const pending = leaveUsers.filter((u) => !ackMap.has(u.id))
          reportRows.push({
            policyId: pol.id,
            title: pol.title,
            slug: pol.slug,
            version: pol.version,
            category: pol.category,
            eligibleCount: leaveUsers.length,
            acknowledgedCount: acknowledged.length,
            pendingCount: pending.length,
            acknowledged: acknowledged.map((u) => ({
              userId: u.id,
              name: u.name,
              email: u.email,
              acknowledgedAt: ackMap.get(u.id)?.toISOString?.() || ackMap.get(u.id)
            })),
            pending: pending.map((u) => ({ userId: u.id, name: u.name, email: u.email }))
          })
        }

        return ok(res, { report: reportRows, eligibleUserCount: leaveUsers.length })
      }

      const published = await prisma.hrPolicy.findMany({
        where: { status: 'published' },
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          version: true,
          body: true,
          updatedAt: true
        }
      })

      const acks = await prisma.hrPolicyAcknowledgment.findMany({
        where: { userId: actor.id },
        select: { policyId: true, policyVersion: true, acknowledgedAt: true }
      })
      const ackKey = new Set(acks.map((a) => `${a.policyId}@${a.policyVersion}`))

      const pendingPolicies = published.filter((p) => !ackKey.has(`${p.id}@${p.version}`))

      return ok(res, {
        pendingPolicies: pendingPolicies.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          category: p.category,
          version: p.version,
          body: p.body,
          updatedAt: p.updatedAt
        })),
        hasPending: pendingPolicies.length > 0,
        publishedCount: published.length,
        myAcknowledgments: acks.map((a) => ({
          policyId: a.policyId,
          policyVersion: a.policyVersion,
          acknowledgedAt: a.acknowledgedAt
        }))
      })
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const acceptAll = body.acceptAll === true
      const policyIds = Array.isArray(body.policyIds) ? body.policyIds.map(String) : []

      const published = await prisma.hrPolicy.findMany({
        where: { status: 'published' },
        select: { id: true, version: true, body: true }
      })
      const pubMap = new Map(published.map((p) => [p.id, p]))

      const acks = await prisma.hrPolicyAcknowledgment.findMany({
        where: { userId: actor.id },
        select: { policyId: true, policyVersion: true }
      })
      const ackKey = new Set(acks.map((a) => `${a.policyId}@${a.policyVersion}`))

      let toAccept = []
      if (acceptAll) {
        toAccept = published.filter((p) => !ackKey.has(`${p.id}@${p.version}`))
      } else {
        if (!policyIds.length) return badRequest(res, 'policyIds or acceptAll required')
        for (const pid of policyIds) {
          const pol = pubMap.get(pid)
          if (!pol) return badRequest(res, `Unknown or unpublished policy: ${pid}`)
          if (ackKey.has(`${pol.id}@${pol.version}`)) continue
          toAccept.push(pol)
        }
      }

      if (!toAccept.length) {
        return ok(res, { accepted: 0, message: 'Nothing to accept' })
      }

      const ip = clientIp(req)
      const userAgent = (req.headers?.['user-agent'] || '').toString().slice(0, 512) || null

      const rows = toAccept.map((pol) => ({
        userId: actor.id,
        policyId: pol.id,
        policyVersion: pol.version,
        bodySha256: sha256Hex(pol.body),
        ip,
        userAgent
      }))

      const result = await prisma.hrPolicyAcknowledgment.createMany({
        data: rows,
        skipDuplicates: true
      })

      return ok(res, { accepted: result.count || rows.length })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('HR policy-acknowledgments API error:', e)
    return serverError(res, 'Internal server error', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
