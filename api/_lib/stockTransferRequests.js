import { createNotificationForUser } from '../notifications.js'
import { isAdminRole } from './authRoles.js'
import {
  approveStockTransferRequestTx,
  canReviewStockTransferRequest,
  canViewStockTransferRequest
} from './stockTransferRequestApprove.js'
import { resolveLocationResponsibleUserIdByLocationId } from './resolveLocationResponsibleUser.js'

function httpError(status, message) {
  const err = new Error(message)
  err.httpStatus = status
  return err
}

export function stockTransferRequestRef() {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `STR-${stamp}-${rand}`
}

function authUserId(req) {
  return String(req.user?.sub || req.user?.id || '').trim()
}

function authUserName(req) {
  return String(req.user?.name || req.user?.email || 'User').trim()
}

function transferRequestLink(requestId) {
  return `#/manufacturing/transfer-requests?id=${encodeURIComponent(requestId)}`
}

async function notifyTransferRequestSubmitted(request, approverUserId) {
  if (!approverUserId) return
  const title = 'Stock transfer request'
  const message = `${request.requestedBy || 'Someone'} requested stock from ${request.fromLocationName || request.fromLocationCode} to ${request.toLocationName || request.toLocationCode} (${request.requestRef})`
  void createNotificationForUser(
    approverUserId,
    'system',
    title,
    message,
    transferRequestLink(request.id),
    {
      source: 'stock_transfer_request',
      requestId: request.id,
      fromLocationId: request.fromLocationId,
      toLocationId: request.toLocationId
    }
  )
}

async function notifyTransferRequestReviewed(request, approved) {
  const requesterId = String(request.requestedById || '').trim()
  if (!requesterId) return
  const title = approved ? 'Transfer request approved' : 'Transfer request rejected'
  const message = approved
    ? `Your transfer request ${request.requestRef} was approved. Stock has been moved.`
    : `Your transfer request ${request.requestRef} was rejected${request.reviewNotes ? `: ${request.reviewNotes}` : '.'}`
  void createNotificationForUser(
    requesterId,
    'system',
    title,
    message,
    transferRequestLink(request.id),
    {
      source: 'stock_transfer_request',
      requestId: request.id,
      status: request.status
    }
  )
}

function parseLinesInput(linesInput) {
  if (!Array.isArray(linesInput)) return []
  return linesInput
    .map((line) => {
      const sku = String(line?.sku || '').trim()
      const itemName = String(line?.itemName || sku).trim()
      const quantity = parseFloat(line?.quantity)
      if (!sku || !itemName || !Number.isFinite(quantity) || quantity <= 0) return null
      return {
        locationInventoryId: line?.locationInventoryId ? String(line.locationInventoryId) : null,
        sku,
        itemName,
        quantity,
        unit: String(line?.unit || 'pcs').trim() || 'pcs'
      }
    })
    .filter(Boolean)
}

async function userCanAccessRequest(req, prisma, request) {
  if (isAdminRole(req.user?.role)) return true
  if (canViewStockTransferRequest(req, request)) return true
  return canReviewStockTransferRequest(req, request)
}

/**
 * @param {object} ctx
 * @param {import('@prisma/client').PrismaClient} ctx.prisma
 * @param {object} ctx.req
 * @param {string|null} ctx.id
 * @param {string|null} ctx.action
 * @param {Function} ctx.auditManufacturing
 * @param {Function} ctx.ok
 * @param {Function} ctx.created
 * @param {Function} ctx.badRequest
 * @param {Function} ctx.notFound
 * @param {Function} ctx.forbidden
 * @param {Function} ctx.serverError
 * @param {Function} ctx.parseJsonBody
 * @returns {Promise<object|null>} response or null if not handled
 */
export async function handleStockTransferRequests(ctx) {
  const {
    prisma,
    req,
    id,
    action,
    auditManufacturing,
    ok,
    created,
    badRequest,
    notFound,
    forbidden,
    serverError,
    parseJsonBody
  } = ctx

  if (req.method === 'GET' && !id) {
    try {
      const status = String(req.query?.status || '').trim()
      const mine = req.query?.mine === '1' || req.query?.mine === 'true'
      const pendingMyApproval =
        req.query?.pendingMyApproval === '1' || req.query?.pendingMyApproval === 'true'
      const uid = authUserId(req)
      const where = {}

      if (status) where.status = status
      if (mine && uid) where.requestedById = uid

      let requests = await prisma.stockTransferRequest.findMany({
        where,
        include: { lines: true },
        orderBy: { requestedAt: 'desc' },
        take: Math.min(parseInt(req.query?.limit, 10) || 100, 200)
      })

      if (pendingMyApproval && uid) {
        const pending = requests.filter((r) => r.status === 'pending_approval')
        const filtered = []
        for (const r of pending) {
          if (await canReviewStockTransferRequest(req, r)) filtered.push(r)
        }
        requests = filtered
      } else if (!isAdminRole(req.user?.role) && !mine && !status) {
        const visible = []
        for (const r of requests) {
          if (await userCanAccessRequest(req, prisma, r)) visible.push(r)
        }
        requests = visible
      }

      return ok({ requests })
    } catch (error) {
      console.error('❌ List stock transfer requests failed:', error)
      return serverError('Failed to list stock transfer requests', error.message)
    }
  }

  if (req.method === 'GET' && id) {
    try {
      const request = await prisma.stockTransferRequest.findUnique({
        where: { id },
        include: { lines: true }
      })
      if (!request) return notFound('Stock transfer request not found')
      if (!(await userCanAccessRequest(req, prisma, request))) {
        return forbidden('You do not have access to this transfer request')
      }
      return ok({ request })
    } catch (error) {
      return serverError('Failed to load transfer request', error.message)
    }
  }

  if (req.method === 'POST' && !id) {
    try {
      const body = await parseJsonBody(req)
      const fromLocationId = String(body?.fromLocationId || '').trim()
      const toLocationId = String(body?.toLocationId || '').trim()
      if (!fromLocationId || !toLocationId) {
        return badRequest('fromLocationId and toLocationId are required')
      }
      if (fromLocationId === toLocationId) {
        return badRequest('From and to location must be different')
      }

      const [fromLoc, toLoc] = await Promise.all([
        prisma.stockLocation.findUnique({ where: { id: fromLocationId } }),
        prisma.stockLocation.findUnique({ where: { id: toLocationId } })
      ])
      if (!fromLoc || !toLoc) return badRequest('Invalid from or to location')

      const lines = parseLinesInput(body?.lines)
      if (!lines.length) return badRequest('At least one line with sku, itemName, and quantity is required')

      for (const line of lines) {
        const fromLi = await prisma.locationInventory.findUnique({
          where: { locationId_sku: { locationId: fromLocationId, sku: line.sku } }
        })
        if (!fromLi || (fromLi.quantity || 0) < line.quantity) {
          return badRequest(`Insufficient stock at source for ${line.sku}`)
        }
      }

      const uid = authUserId(req)
      if (!uid) return badRequest('You must be signed in to submit a transfer request')

      const request = await prisma.stockTransferRequest.create({
        data: {
          requestRef: stockTransferRequestRef(),
          fromLocationId: fromLoc.id,
          toLocationId: toLoc.id,
          fromLocationCode: fromLoc.code || '',
          fromLocationName: fromLoc.name || '',
          toLocationCode: toLoc.code || '',
          toLocationName: toLoc.name || '',
          status: 'pending_approval',
          requestedById: uid,
          requestedBy: authUserName(req),
          notes: String(body?.notes || '').trim(),
          meta: JSON.stringify({ userAgent: req.headers?.['user-agent'] || '' }),
          lines: { create: lines }
        },
        include: { lines: true }
      })

      const approverUserId = await resolveLocationResponsibleUserIdByLocationId(fromLoc.id)
      await notifyTransferRequestSubmitted(request, approverUserId)

      auditManufacturing('create', 'stock-transfer-request', request.id, {
        requestRef: request.requestRef,
        fromLocationId: request.fromLocationId,
        toLocationId: request.toLocationId,
        lineCount: request.lines.length
      })
      return created({ request })
    } catch (error) {
      console.error('❌ Create stock transfer request failed:', error)
      return serverError('Failed to create transfer request', error.message)
    }
  }

  if (req.method === 'POST' && id && action === 'approve') {
    try {
      const body = await parseJsonBody(req)
      const request = await prisma.stockTransferRequest.findUnique({
        where: { id },
        include: { lines: true }
      })
      if (!request) return notFound('Stock transfer request not found')
      if (!(await canReviewStockTransferRequest(req, request))) {
        return forbidden('You are not authorized to approve this transfer request')
      }

      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.stockTransferRequest.findUnique({
          where: { id },
          include: { lines: true }
        })
        if (!fresh) throw httpError(404, 'Stock transfer request not found')
        return approveStockTransferRequestTx(tx, fresh, {
          reviewerId: authUserId(req),
          reviewerName: authUserName(req),
          reviewNotes: body?.reviewNotes || body?.notes || ''
        })
      })

      await notifyTransferRequestReviewed(result.request, true)

      auditManufacturing('update', 'stock-transfer-request-approve', id, {
        requestRef: result.request.requestRef,
        movementIds: result.movementIds
      })
      return ok({ request: result.request })
    } catch (error) {
      if (error?.httpStatus === 400) return badRequest(error.message)
      if (error?.httpStatus === 404) return notFound(error.message)
      console.error('❌ Approve stock transfer request failed:', error)
      return serverError('Failed to approve transfer request', error.message)
    }
  }

  if (req.method === 'POST' && id && action === 'reject') {
    try {
      const body = await parseJsonBody(req)
      const request = await prisma.stockTransferRequest.findUnique({ where: { id } })
      if (!request) return notFound('Stock transfer request not found')
      if (!(await canReviewStockTransferRequest(req, request))) {
        return forbidden('You are not authorized to reject this transfer request')
      }
      if (request.status !== 'pending_approval') {
        return badRequest('Only pending requests can be rejected')
      }

      const updated = await prisma.stockTransferRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewedById: authUserId(req) || null,
          reviewedBy: authUserName(req),
          reviewedAt: new Date(),
          reviewNotes: String(body?.reviewNotes || body?.notes || '').trim()
        },
        include: { lines: true }
      })

      await notifyTransferRequestReviewed(updated, false)

      auditManufacturing('update', 'stock-transfer-request-reject', id, {
        requestRef: updated.requestRef
      })
      return ok({ request: updated })
    } catch (error) {
      return serverError('Failed to reject transfer request', error.message)
    }
  }

  if (req.method === 'POST' && id && action === 'cancel') {
    try {
      const request = await prisma.stockTransferRequest.findUnique({ where: { id } })
      if (!request) return notFound('Stock transfer request not found')
      const uid = authUserId(req)
      if (request.requestedById !== uid && !isAdminRole(req.user?.role)) {
        return forbidden('Only the requester can cancel this transfer request')
      }
      if (request.status !== 'pending_approval') {
        return badRequest('Only pending requests can be cancelled')
      }

      const updated = await prisma.stockTransferRequest.update({
        where: { id },
        data: { status: 'cancelled' },
        include: { lines: true }
      })

      auditManufacturing('update', 'stock-transfer-request-cancel', id, {
        requestRef: updated.requestRef
      })
      return ok({ request: updated })
    } catch (error) {
      return serverError('Failed to cancel transfer request', error.message)
    }
  }

  return null
}
