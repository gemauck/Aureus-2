import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, forbidden, ok, serverError, unauthorized } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isAdminRole } from './_lib/authRoles.js'
import { createTravelBookingBodySchema } from './_lib/travelBookingPayload.js'
import {
  notifyAssigneeNewTravelRequest,
  notifyRequesterTravelSubmitted
} from './_lib/travelBookingNotify.js'

function actorId(req) {
  return req.user?.sub || req.user?.id || null
}

async function loadActor(req) {
  const id = actorId(req)
  if (!id) return null
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, status: true }
  })
}

function serializeRequest(row, { includeInternalNotes } = { includeInternalNotes: true }) {
  let payload = {}
  try {
    payload = JSON.parse(row.payload || '{}')
  } catch {
    payload = {}
  }
  return {
    id: row.id,
    requesterId: row.requesterId,
    assigneeId: row.assigneeId,
    status: row.status,
    tripTitle: row.tripTitle,
    businessReason: row.businessReason,
    payload,
    ...(includeInternalNotes ? { assigneeInternalNotes: row.assigneeInternalNotes } : {}),
    messageToRequester: row.messageToRequester,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requester: row.requester,
    assignee: row.assignee
  }
}

const includeUsers = {
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } }
}

async function handler(req, res) {
  try {
    const actor = await loadActor(req)
    if (!actor) return unauthorized(res, 'Authentication required')

    if (req.method === 'GET') {
      const url = new URL(req.url || '', 'http://local')
      const scope = (url.searchParams.get('scope') || 'my_submissions').trim()
      const statusFilter = (url.searchParams.get('status') || '').trim()

      const where = {}
      if (statusFilter && statusFilter.length > 0) {
        where.status = statusFilter
      }

      const admin = isAdminRole(actor.role)
      if (scope === 'all') {
        if (!admin) return forbidden(res, 'Admin access required for scope=all')
      } else if (scope === 'assigned_to_me') {
        where.assigneeId = actor.id
      } else {
        where.requesterId = actor.id
      }

      const rows = await prisma.travelBookingRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: includeUsers
      })
      return ok(res, {
        requests: rows.map((row) =>
          serializeRequest(row, {
            includeInternalNotes: admin || row.assigneeId === actor.id
          })
        )
      })
    }

    if (req.method === 'POST') {
      if (!isAdminRole(actor.role)) {
        return forbidden(res, 'Only administrators can submit travel requests in this release')
      }

      const raw = await parseJsonBody(req, res)
      if (raw === undefined) return

      const parsed = createTravelBookingBodySchema.safeParse(raw)
      if (!parsed.success) {
        const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
        return badRequest(res, msg || 'Invalid body')
      }

      const { assigneeId, tripTitle, businessReason, payload } = parsed.data

      if (assigneeId === actor.id) {
        return badRequest(res, 'Choose a different nominee than yourself')
      }

      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, email: true, name: true, status: true }
      })
      if (!assignee || assignee.status === 'inactive') {
        return badRequest(res, 'Nominated person not found or inactive')
      }
      if (!assignee.email || !String(assignee.email).trim()) {
        return badRequest(res, 'Nominated person has no email address')
      }

      const payloadJson = JSON.stringify(payload)

      const row = await prisma.travelBookingRequest.create({
        data: {
          requesterId: actor.id,
          assigneeId,
          tripTitle: tripTitle || '',
          businessReason,
          payload: payloadJson,
          status: 'submitted',
          assigneeInternalNotes: '',
          messageToRequester: ''
        },
        include: includeUsers
      })

      void notifyAssigneeNewTravelRequest({
        request: row,
        requester: row.requester,
        assignee: row.assignee
      })
      void notifyRequesterTravelSubmitted({
        request: row,
        requester: row.requester
      })

      return created(res, { request: serializeRequest(row) })
    }

    return unauthorized(res, 'Method not allowed')
  } catch (e) {
    console.error('travel-booking-requests:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
