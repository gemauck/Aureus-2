import { executeStockTransferTx } from './executeStockTransferTx.js'
import { resolveLocationResponsibleUserIdByLocationId } from './resolveLocationResponsibleUser.js'

function httpError(status, message) {
  const err = new Error(message)
  err.httpStatus = status
  return err
}

/**
 * Approve a pending stock transfer request: execute transfers and update request status.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function approveStockTransferRequestTx(tx, request, { reviewerId, reviewerName, reviewNotes = '' }) {
  if (request.status !== 'pending_approval') {
    throw httpError(400, 'Only pending requests can be approved')
  }

  const lines = request.lines || []
  if (!lines.length) {
    throw httpError(400, 'Transfer request has no lines')
  }

  const movementIds = []
  const ref = request.requestRef || request.id

  for (const line of lines) {
    const { movement } = await executeStockTransferTx(tx, {
      sku: line.sku,
      itemName: line.itemName,
      quantity: line.quantity,
      fromLocationId: request.fromLocationId,
      toLocationId: request.toLocationId,
      performedBy: reviewerName || 'System',
      reference: ref,
      notes: `Approved transfer request ${ref}`
    })
    movementIds.push(movement.id)
  }

  const updated = await tx.stockTransferRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      reviewedById: reviewerId || null,
      reviewedBy: reviewerName || '',
      reviewedAt: new Date(),
      reviewNotes: String(reviewNotes || '').trim(),
      stockMovementIds: JSON.stringify(movementIds)
    },
    include: { lines: true }
  })

  return { request: updated, movementIds }
}

/**
 * @param {object} req
 * @param {{ id: string, fromLocationId: string, status: string, requestedById?: string }} request
 * @returns {Promise<boolean>}
 */
export async function canReviewStockTransferRequest(req, request) {
  if (!request) return false
  const { isAdminRole } = await import('./authRoles.js')
  if (isAdminRole(req.user?.role)) return true
  const uid = String(req.user?.sub || req.user?.id || '').trim()
  if (!uid) return false
  const responsibleId = await resolveLocationResponsibleUserIdByLocationId(request.fromLocationId)
  return Boolean(responsibleId && responsibleId === uid)
}

export function canViewStockTransferRequest(req, request) {
  const uid = String(req.user?.sub || req.user?.id || '').trim()
  if (!uid || !request) return false
  if (request.requestedById === uid) return true
  return false
}
