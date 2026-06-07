/**
 * GET /api/quickbooks/connection — status
 * PATCH /api/quickbooks/connection — update default payment account
 * DELETE /api/quickbooks/connection — disconnect
 */
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest, forbidden, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import {
  disconnectQuickBooks,
  getQuickBooksConnection,
  isQuickBooksConfigured,
  serializeQuickBooksConnection
} from '../_lib/quickbooksOnline.js'
import { logAuditFromRequest } from '../_lib/manufacturingAuditLog.js'

async function handler(req, res) {
  try {
    const user = await getUserForReceiptCapture(req)
    if (!user?.id) return forbidden(res, 'Authentication required')

    if (req.method === 'GET') {
      const conn = await getQuickBooksConnection()
      return ok(res, {
        configured: isQuickBooksConfigured(),
        ...serializeQuickBooksConnection(conn)
      })
    }

    if (!isReceiptCaptureAdmin(user)) {
      return forbidden(res, 'Only administrators can manage QuickBooks connection.')
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const paymentId = body.defaultPaymentAccountId != null ? String(body.defaultPaymentAccountId).trim() : null
      if (!paymentId) {
        return badRequest(res, 'defaultPaymentAccountId is required')
      }
      const conn = await getQuickBooksConnection()
      if (!conn?.realmId) {
        return badRequest(res, 'QuickBooks is not connected')
      }
      const updated = await prisma.quickBooksConnection.update({
        where: { id: 'default' },
        data: { defaultPaymentAccountId: paymentId }
      })
      return ok(res, serializeQuickBooksConnection(updated))
    }

    if (req.method === 'DELETE') {
      await disconnectQuickBooks()
      void logAuditFromRequest(prisma, req, {
        action: 'disconnect',
        entity: 'quickbooks',
        details: { resource: 'receipt_capture' }
      })
      return ok(res, { disconnected: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('quickbooks connection:', e)
    return serverError(res, 'Request failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
