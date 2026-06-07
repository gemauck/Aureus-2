/**
 * POST /api/receipt-documents/push-qbo — push reviewed expenses to QuickBooks Online (admin).
 * Body: { documentIds?: string[], allReviewed?: boolean, force?: boolean }
 */
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import { getQuickBooksConnection, pushReceiptDocumentToQbo } from '../_lib/quickbooksOnline.js'
import { logAuditFromRequest } from '../_lib/manufacturingAuditLog.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'Method not allowed')

    const user = await getUserForReceiptCapture(req)
    if (!user?.id) return forbidden(res, 'Authentication required')
    if (!isReceiptCaptureAdmin(user)) {
      return forbidden(res, 'Only administrators can push expenses to QuickBooks.')
    }

    const conn = await getQuickBooksConnection()
    if (!conn?.realmId || !conn.defaultPaymentAccountId) {
      return badRequest(res, 'Connect QuickBooks and set a default payment account before pushing.')
    }

    const body = await parseJsonBody(req)
    const force = body.force === true
    const ids = Array.isArray(body.documentIds) ? body.documentIds.map(String).filter(Boolean) : []

    let where = {}
    if (ids.length) {
      where = { id: { in: ids } }
    } else if (body.allReviewed) {
      where = { status: { in: ['reviewed', 'draft'] } }
    } else {
      return badRequest(res, 'Provide documentIds or allReviewed: true')
    }

    const docs = await prisma.receiptDocument.findMany({
      where,
      include: {
        account: true,
        costCenter: true
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    })

    const results = []
    for (const doc of docs) {
      if (!doc.accountId) {
        results.push({ id: doc.id, ok: false, error: 'No account allocated' })
        continue
      }
      try {
        const out = await pushReceiptDocumentToQbo(doc, { force })
        results.push({
          id: doc.id,
          ok: true,
          skipped: out.skipped === true,
          qboPurchaseId: out.qboPurchaseId,
          attachWarning: out.attachWarning
        })
      } catch (e) {
        const message = e?.message || 'Push failed'
        await prisma.receiptDocument.update({
          where: { id: doc.id },
          data: { qboSyncError: message.slice(0, 2000) }
        })
        results.push({ id: doc.id, ok: false, error: message })
      }
    }

    const pushed = results.filter((r) => r.ok && !r.skipped).length
    const failed = results.filter((r) => !r.ok).length
    const skipped = results.filter((r) => r.skipped).length

    void logAuditFromRequest(prisma, req, {
      action: 'sync',
      entity: 'quickbooks',
      details: {
        resource: 'receipt_capture',
        pushed,
        failed,
        skipped,
        documentIds: results.map((r) => r.id)
      }
    })

    return ok(res, { pushed, failed, skipped, results })
  } catch (e) {
    console.error('receipt-documents/push-qbo:', e)
    return serverError(res, 'QuickBooks push failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
