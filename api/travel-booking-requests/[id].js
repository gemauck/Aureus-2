import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isAdminRole } from '../_lib/authRoles.js'
import { patchTravelBookingBodySchema } from '../_lib/travelBookingPayload.js'
import { notifyRequesterTravelUpdate } from '../_lib/travelBookingNotify.js'

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

function canAccessRow(actor, row) {
  if (!actor || !row) return false
  if (isAdminRole(actor.role)) return true
  if (row.requesterId === actor.id) return true
  if (row.assigneeId === actor.id) return true
  return false
}

function canPatchRow(actor, row) {
  if (!actor || !row) return false
  if (isAdminRole(actor.role)) return true
  return row.assigneeId === actor.id
}

async function handler(req, res) {
  try {
    const id = req.params?.id
    if (!id || typeof id !== 'string') {
      return badRequest(res, 'Missing request id')
    }

    const actor = await loadActor(req)
    if (!actor) return unauthorized(res, 'Authentication required')

    if (req.method === 'GET') {
      const row = await prisma.travelBookingRequest.findUnique({
        where: { id },
        include: includeUsers
      })
      if (!row) return notFound(res, 'Request not found')
      if (!canAccessRow(actor, row)) return forbidden(res, 'Access denied')
      const includeInternal = canPatchRow(actor, row)
      return ok(res, { request: serializeRequest(row, { includeInternalNotes: includeInternal }) })
    }

    if (req.method === 'PATCH') {
      const row = await prisma.travelBookingRequest.findUnique({
        where: { id },
        include: includeUsers
      })
      if (!row) return notFound(res, 'Request not found')
      if (!canPatchRow(actor, row)) return forbidden(res, 'Only the nominated booker or an admin can update this request')

      const raw = await parseJsonBody(req, res)
      if (raw === undefined) return

      const parsed = patchTravelBookingBodySchema.safeParse(raw)
      if (!parsed.success) {
        const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
        return badRequest(res, msg || 'Invalid body')
      }

      const body = parsed.data
      if (body.status == null && body.assigneeInternalNotes == null && body.messageToRequester == null) {
        return badRequest(res, 'No changes provided')
      }

      const prevStatus = row.status
      const prevMessage = row.messageToRequester || ''
      const data = {}
      if (body.status != null) data.status = body.status
      if (body.assigneeInternalNotes != null) data.assigneeInternalNotes = body.assigneeInternalNotes
      if (body.messageToRequester != null) data.messageToRequester = body.messageToRequester

      const updated = await prisma.travelBookingRequest.update({
        where: { id },
        data,
        include: includeUsers
      })

      const statusChanged = body.status != null && body.status !== prevStatus
      const messageChanged =
        body.messageToRequester != null &&
        String(body.messageToRequester).trim() !== String(prevMessage).trim()
      if (statusChanged || messageChanged) {
        void notifyRequesterTravelUpdate({
          request: updated,
          requester: updated.requester,
          assignee: updated.assignee,
          prevStatus
        })
      }

      return ok(res, {
        request: serializeRequest(updated, { includeInternalNotes: canPatchRow(actor, updated) })
      })
    }

    return unauthorized(res, 'Method not allowed')
  } catch (e) {
    console.error('travel-booking-requests/[id]:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
